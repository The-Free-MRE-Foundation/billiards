/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { Actor, ActorPath, AnimationData, AnimationDataLike, AnimationEaseCurves, AnimationWrapMode, AssetContainer, ButtonBehavior, ColliderType, CollisionLayer, Context, DegreesToRadians, Quaternion, ScaledTransformLike, User, Vector2Like, Vector3, Vector3Like, } from "@microsoft/mixed-reality-extension-sdk";
import { Ball, BallResourceIds, BallState, BALL_RADIUS } from "./ball";
import { ClientType, Player } from './player';
import { PoolMenu } from './menus/pool_menu';
import { PoolDB } from './db';
import { prefabs, Sound } from './prefabs';
import { AssetData } from 'altvr-gui';

const Matter = require('matter-js');
const Engine = Matter.Engine;
const Events = Matter.Events;
const Runner = Matter.Runner;
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;

export const MATTER_TO_MRE = 1 / 100;
const TABLE_HEIGHT = 0.865 - BALL_RADIUS;
const ALPHA = 0.0001;
const MIN_RANGE = 1.2;

const REPLAY_CUE_OFFSET = 0.9;

const MONGODB_HOST = process.env['MONGODB_HOST'];
const MONGODB_PORT = process.env['MONGODB_PORT'];
const MONGODB_USER = process.env['MONGODB_USER'];
const MONGODB_PASSWORD = process.env['MONGODB_PASSWORD'];
const DATABASE = process.env['DATABASE'];

const mongoDBOptions = {
    name: 'pool',
    host: MONGODB_HOST,
    port: MONGODB_PORT,
    user: MONGODB_USER,
    password: MONGODB_PASSWORD,
    database: DATABASE,
}

export interface PoolOptions {
    poolTableResourceId?: string,
}

export interface PoolSnap {
    timePassed: number,
    playerId: number,
    balls: BallState[],
    cue: {
        velocity: Vector2Like,
        distance: number,
    }
};

export class Pool {
    // physics
    private engine: any;
    private runner: any;

    // unity
    private table: Actor;
    private pole: Actor;

    // logic
    private simulation: NodeJS.Timeout;
    private balls: Ball[];
    private cue: Ball;
    private laser: Actor;
    private players: Map<number, Player>;

    public cp: Vector3; // cue position

    // snaps
    private lastCueTime: number;
    private lastSleepTime: number;
    private snaps: PoolSnap[] = [];
    private playing: boolean = false;
    private timeout: NodeJS.Timeout;

    // ui
    private menuAnchor: Actor;
    private menu: PoolMenu;

    // db
    private db: PoolDB;
    private gameId: string;

    constructor(private context: Context, private assets: AssetContainer, private options: PoolOptions, private uiassets: { [name: string]: AssetData }, private baseUrl: string) {
        this.players = new Map<number, Player>();
        this.cp = new Vector3();
        this.init();
    }

    private async init() {
        this.createPhysics();
        this.createPoolTable();
        this.createPoleModel();
        await this.table.created();
        this.createBalls();
        [
            { x: -1.165, y: 0.918, z: 0 },
            { x: 1.165, y: 0.918, z: 0 },
        ].forEach((position, id) => {
            this.createJoinButton(position, id);
        });

        this.createMenus();
        this.createDBHelper();
    }

    private createPhysics() {
        Matter.Resolver._restingThresh = 0.05;
        this.engine = Engine.create({
            positionIterations: 10,
            velocityIterations: 10,
        });
        this.engine.gravity.y = 0;
        this.engine.timing.isFixed = true;
        const bodies = [
            // 4 * horizontal
            [-54.23, 72, 92, 15, 0],
            [54.23, 72, 92, 15, 0],
            [-54.23, -72, 92, 15, 0],
            [54.23, -72, 92, 15, 0],
            // 2 * vertical
            [-117.29, 0, 15, 108, 0],
            [117.29, 0, 15, 108, 0],
            // AABB
            [0, 87, 250, 15, 0],
            [0, -87, 250, 15, 0],
            [132.29, 0, 15, 189, 0],
            [-132.29, 0, 15, 189, 0],
            // top left
            [-97.53776, 72.32636, -7, 15, -44],
            [-101.7654, 74.86261, 7, 11, 0],
            [-14.87916, 68.66277, 4.6, 15, 75],
            [-10.53943, 74.44326, 7, 11, 0],
            // top right
            [97.53776, 72.32636, -7, 15, 44],
            [101.7654, 74.86261, 7, 11, 0],
            [14.87916, 68.66277, 4.6, 15, -75],
            [10.53943, 74.44326, 7, 11, 0],
            // bot left
            [-97.53776, -72.32636, -7, 15, 44],
            [-101.7654, -74.86261, 7, 11, 0],
            [-14.87916, -68.66277, 4.6, 15, -75],
            [-10.53943, -74.44326, 7, 11, 0],
            // bot right
            [97.53776, -72.32636, -7, 15, -44],
            [101.7654, -74.86261, 7, 11, 0],
            [14.87916, -68.66277, 4.6, 15, 75],
            [10.53943, -74.44326, 7, 11, 0],
            // left
            [-117.5176, 52.03626, 7, 15, -44],
            [-119.8254, 56.36261, 10, 7, 0],
            [-117.5176, -52.03626, 7, 15, 44],
            [-119.8254, -56.36261, 10, 7, 0],
            // right
            [117.5176, 52.03626, 7, 15, 44],
            [119.8254, 56.36261, 10, 7, 0],
            [117.5176, -52.03626, 7, 15, -44],
            [119.8254, -56.36261, 10, 7, 0],
        ].map(a => {
            const body = Bodies.rectangle(a[0], a[1], a[2], a[3], { isStatic: true, label: "wall" });
            Matter.Body.rotate(body, a[4] * DegreesToRadians);
            return body;
        });
        Composite.add(this.engine.world, bodies);

        // events
        Events.on(this.engine, 'collisionStart', (e: any) => {
            this.handleCollisionStart(e);
        });

        this.runner = Runner.create({ delta: 1000 / 60 / 3 });
        Runner.run(this.runner, this.engine);
    }

    private handleCollisionStart(e: any) {
        const BALL_SOUNDS = prefabs.sounds.ball;
        const RAIL_SOUNDS = prefabs.sounds.rail;
        e.pairs.forEach((collision: any) => {
            const { bodyA, bodyB } = collision;
            if (bodyA.label == "ball" && bodyB.label == "ball") {
                this.playSound(BALL_SOUNDS[Math.floor(Math.random() * BALL_SOUNDS.length)], this.table);
            } else if (bodyA.label == "wall" || bodyB.label == "wall") {
                this.playSound(RAIL_SOUNDS[Math.floor(Math.random() * RAIL_SOUNDS.length)], this.table);
            }
        });
    }

    private createPoolTable() {
        this.table = Actor.CreateFromLibrary(this.context, {
            resourceId: this.options.poolTableResourceId,
            actor: {
                transform: {
                    local: {
                        position: { x: 0, y: 0, z: 0 }
                    }
                }
            }
        });
    }

    private createPoleModel() {
        const CueResourceIds = prefabs.cues;
        this.pole = Actor.CreateFromLibrary(this.context, {
            resourceId: CueResourceIds['cue1'],
            actor: {
                appearance: {
                    enabled: false,
                },
                transform: {
                    local: {
                        position: { x: 0, y: 0, z: REPLAY_CUE_OFFSET }
                    }
                },
            },
        });
    }

    private createBalls() {
        const y = TABLE_HEIGHT + BALL_RADIUS;
        const r = BALL_RADIUS * 1.01;
        const h = 2 * r * Math.cos(30 * DegreesToRadians);

        let th = [...Array(5).keys()].map(i => i + 1);
        th = th.map((i, _) => th.slice(0, i).reduce((a, c) => a + c, 0));
        this.balls = [...Array(15).keys()].map(i => {
            const resourceId = BallResourceIds[`${i + 1}`];
            const j = th.findIndex(t => i < t);
            const k = j <= 0 ? 0 : i - th[j - 1];
            const x = -j * h;
            const z = -j * r + k * r * 2;
            const transform = {
                position: { x, y, z }
            };
            return new Ball(this.context, this.assets, {
                engine: this.engine, resourceId, transform, name: `${i + 1}`,
            });
        });

        this.cue = new Ball(this.context, this.assets, {
            engine: this.engine, resourceId: BallResourceIds['cue'], transform: { position: { x: 0.7, y, z: 0 } },
            name: 'cue',
        });

        this.awake();
    }

    private reset() {
        if (this.simulation) {
            clearInterval(this.simulation);
            this.simulation = undefined;
        }
        [...this.balls, this.cue].forEach(b => {
            b.remove();
        });

        this.snaps = [];
        this.gameId = undefined;

        this.createBalls();
    }

    private awake() {
        if (this.simulation) { return; }
        this.runner.enabled = true;
        this.simulation = setInterval(() => {
            // Engine.update(this.engine);
            [...this.balls, this.cue].filter(b => !b.removed).forEach(b => {
                const pos = b.body.position;
                b.actor.transform.local.position.x = pos.x * MATTER_TO_MRE;
                b.actor.transform.local.position.z = pos.y * MATTER_TO_MRE;

                if (this.isOutOfBound(pos)) {
                    if (b.name != 'cue') {
                        b.remove(100);
                        this.checkResult();
                    } else {
                        b.reset();
                    }
                }

                if (b.name == 'cue') {
                    this.cp.copyFrom(b.actor.transform.local.position);
                }

            });
            if (this.isSleeping()) {
                clearInterval(this.simulation);
                this.simulation = undefined;
            }
            if (this.isSleeping(0.005)) {
                this.lastSleepTime = Date.now();
            }
        }, 1000 / 30);
    }

    private sleep() {
        [this.cue, ...this.balls].forEach(b => {
            Matter.Body.setVelocity(b.body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(b.body, 0);
        });
        this.runner.enabled = false;
        if (this.simulation) {
            clearInterval(this.simulation)
            this.simulation = undefined;
        }
    }

    private isOutOfBound(pos: any) {
        const rr = BALL_RADIUS / MATTER_TO_MRE * 0.9;
        const AABB = {
            top: 87 + 15 / 2 + rr,
            bottom: -87 - 15 / 2 - rr,
            left: -132.29 - 15 / 2 - rr,
            right: 132.29 + 15 / 2 + rr,
        };
        const origins = [
            { x: 113.7, y: 68.2, r: 17 / 2 }, // top right
            { x: -113.7, y: 68.2, r: 17 / 2 }, // top left
            { x: 0, y: 70.9, r: 14 / 2 }, // top mid
            { x: 113.7, y: -68.2, r: 17 / 2 }, // bot right
            { x: -113.7, y: -68.2, r: 17 / 2 }, // bot left
            { x: 0, y: -70.9, r: 14 / 2 }, // bot mid
        ]

        return origins.some(o => {
            const a = pos.x - o.x;
            const b = pos.y - o.y;
            const d = Math.sqrt(a * a + b * b);
            return d < o.r;
        }) || (
                pos.x > AABB.right ||
                pos.x < AABB.left ||
                pos.y > AABB.top ||
                pos.y < AABB.bottom
            );
    }

    private isSleeping(alpha: number = ALPHA) {
        const bodies = Composite.allBodies(this.engine.world);
        return bodies.every((b: any) => b.speed < alpha);
    }

    private createJoinButton(position: Vector3Like, id: number) {
        const dim = { width: 0.1, height: 0.1, depth: 0.1 };
        let mesh = this.assets.meshes.find(m => m.name === 'mesh_join_button');
        if (!mesh) {
            mesh = this.assets.createBoxMesh('mesh_join_button', dim.width, dim.height, dim.depth);
        }
        const material = this.assets.materials.find(m => m.name === 'invis');
        const btn = Actor.Create(this.context, {
            actor: {
                transform: {
                    local: {
                        position,
                    }
                },
                appearance: {
                    meshId: mesh.id,
                    materialId: material.id
                },
                collider: {
                    geometry: { shape: ColliderType.Sphere },
                    layer: CollisionLayer.Hologram
                },
            }
        });
        const MarkerResourceId = prefabs.marker;
        const CueResourceIds = prefabs.cues;
        Actor.CreateFromLibrary(this.context, {
            resourceId: MarkerResourceId,
            actor: {
                parentId: btn.id,
            }
        });
        Actor.CreateFromLibrary(this.context, {
            resourceId: CueResourceIds[`cue${id + 1}`],
            actor: {
                parentId: btn.id,
                transform: {
                    local: {
                        position: {
                            x: 0, y: -0.03, z: -0.302
                        }
                    }
                }
            }
        });
        btn.setBehavior(ButtonBehavior).onClick((user, _) => {
            // user already joined
            if ([...this.players.values()].some(p => p.user.id == user.id)) { return; }
            // pole already taken
            if (this.players.has(id)) { return; }
            this.addPlayer(user, id);
            btn.destroy();
            this.createLeaveButton(position, id);
        });
    }

    private createLeaveButton(position: Vector3Like, id: number) {
        const dim = { width: 0.1, height: 0.1, depth: 0.1 };
        let mesh = this.assets.meshes.find(m => m.name === 'mesh_leave_button');
        if (!mesh) {
            mesh = this.assets.createBoxMesh('mesh_leave_button', dim.width, dim.height, dim.depth);
        }
        const material = this.assets.materials.find(m => m.name === 'invis');
        const user = this.players.get(id).user;
        const btn = Actor.Create(this.context, {
            actor: {
                exclusiveToUser: user.id,
                transform: {
                    local: {
                        position,
                    }
                },
                appearance: {
                    meshId: mesh.id,
                    materialId: material.id,
                },
                collider: {
                    geometry: { shape: ColliderType.Sphere },
                    layer: CollisionLayer.Hologram
                },
            }
        });
        const GrabResourceId = prefabs.grab;
        Actor.CreateFromLibrary(this.context, {
            resourceId: GrabResourceId,
            actor: {
                exclusiveToUser: user.id,
                parentId: btn.id,
            }
        });
        btn.setBehavior(ButtonBehavior).onClick((u, _) => {
            if (user.id != u.id) { return; }
            this.removePlayer(id);
            btn.destroy();
            this.createJoinButton(position, id);
        });
    }

    private async createMenus() {
        this.menuAnchor = Actor.Create(this.context, {});
        this.menu = new PoolMenu(this.context, this.assets, {
            url: 'pool.xml',
            replay_menu_url: 'replay.xml',
            about_menu_url: 'about.xml',
            leaderboard_menu_url: 'leader_board.xml',
            scale: 0.25,
            exclusive: false,
            baseUrl: this.baseUrl,
            assets: this.uiassets,
        }, null);

        await this.menu.view.created();
        this.menu.view.root.anchor.parentId = this.menuAnchor.id;
        this.menuAnchor.transform.local.position.copyFromFloats(0.55, 0.45, -0.80);

        this.menu.checkUser = (user: User) => {
            if (![...this.players.values()].some(p => p.user.id == user.id)) {
                return false;
            }
            return true;
        };
        this.menu.onAction = (action: string, user: User, params?: any) => {
            if (![...this.players.values()].some(p => p.user.id == user.id)) {
                user.prompt("This button won't work unless you join the game");
                return;
            }
            switch (action) {
                case 'reset':
                    user.prompt("Reset Game?", false).then((dialog) => {
                        if (dialog.submitted) {
                            this.reset();
                        }
                    });
                    break;
                case 'load':
                    user.prompt("You'll lose your current game, continue?", true).then(async (dialog) => {
                        if (dialog.submitted) {
                            const json = (await this.db.loadGame(dialog.text, user, this.context.sessionId)).data;
                            const snaps = JSON.parse(json);
                            if (snaps) {
                                this.snaps = snaps;
                                user.prompt("Loaded");
                            }
                        }
                    });
                    break;
                case 'save':
                    user.prompt("Save As:", true).then(async (dialog) => {
                        if (dialog.submitted) {
                            await this.db.saveGame(dialog.text, user, this.context.sessionId, JSON.stringify(this.snaps));
                            user.prompt("Saved");
                        }
                    });
                    break;
                case 'replay':
                    user.prompt("Playback?").then((dialog) => {
                        if (dialog.submitted) {
                            this.replayGame();
                        }
                    });
                    break;
                case '2d':
                    const player = [...this.players.values()].find(p => p.user.id == user.id);
                    player.type = player.type === ClientType._2D ? ClientType.VR : ClientType._2D;
                    break;
            }
        };
        this.menu.getLeaderboard = async () => {
            return await this.db.fetchUserData();
        }
    }

    private createDBHelper() {
        this.db = new PoolDB(mongoDBOptions);
    }

    private addPlayer(user: User, id: number) {
        if (this.players.has(id)) { return; }
        const CUE_SOUNDS = prefabs.sounds.cue;
        const player = new Player(this.context, this.assets, { user });
        player.onFire = () => {
            const d = player.pp.subtract(this.cp).length();
            if (d > MIN_RANGE) { return; }

            this.playSound(CUE_SOUNDS[Math.floor(Math.random() * CUE_SOUNDS.length)], this.table);

            const velocity = Matter.Vector.create(-player.d_world.x * 10, -player.d_world.z * 10);
            const now = Date.now();
            const timePassed =
                this.lastCueTime !== undefined ?
                    (
                        this.lastSleepTime !== undefined && this.lastSleepTime > this.lastCueTime ?
                            (now > this.lastSleepTime ? this.lastSleepTime - this.lastCueTime : now) :
                            now - this.lastCueTime)
                    : 0;

            this.lastCueTime = now;
            this.snap(d, velocity, id, timePassed);

            Matter.Body.setVelocity(this.cue.body, velocity);
            if (!this.simulation) { this.awake(); }
            if (this.laser) {
                this.laser.destroy();
                this.laser = undefined;
            }
        }

        player.onUpdate = () => {
            const d = player.pp.subtract(this.cp).length();
            if (d > MIN_RANGE) {
                if (this.laser) {
                    this.laser.destroy();
                    this.laser = undefined;
                }
                return;
            }
            if (!this.laser) {
                const LaserResourceId = prefabs.laser;
                this.laser = Actor.CreateFromLibrary(this.context, {
                    resourceId: LaserResourceId,
                    actor: {
                        parentId: this.cue.actor.id,
                        exclusiveToUser: player.user.id,
                    }
                });
            }

            const e = player.pq.toEulerAngles(); e.x = 0;
            this.laser.transform.local.rotation.copyFrom(Quaternion.FromEulerVector(e));
        }

        this.players.set(id, player);
    }

    private removePlayer(id: number) {
        if (!this.players.has(id)) { return; }
        const player = this.players.get(id);
        player.remove();
        this.players.delete(id);
    }

    private checkResult() {
        if (this.isGameOver()) {
            this.onGameOver();
        }
    }

    private isGameOver() {
        // black
        const blackBall = this.balls.find(b => b.name == '5');
        return blackBall.removed;
    }

    private async onGameOver() {
        if (this.gameId) { return; }
        this.gameId = `${Date.now()}`;
        const players: { [id: number]: string } = {};
        this.players.forEach((p, id) => {
            players[id] = p.user.name;
        });
        this.db.submitGameResult({
            id: this.gameId,
            players,
            snaps: this.snaps
        });
    }

    private playSound(sound: Sound, actor: Actor) {
        const throwSound = Actor.CreateFromLibrary(this.context, {
            resourceId: sound.resourceId,
            actor: { parentId: actor.id }
        });
        setTimeout(() => {
            throwSound.destroy();
        }, sound.duration * 1000);
    }

    private snap(distance: number, velocity: Vector2Like, id: number, timePassed: number) {
        const balls = [...this.balls, this.cue].filter(b => !b.removed).map(b => {
            return {
                name: b.name,
                position: JSON.parse(JSON.stringify(b.body.position)),
                angle: b.body.angle,
                velocity: JSON.parse(JSON.stringify(b.body.velocity)),
                angularVelocity: b.body.angularVelocity,
            };
        });
        const snap = {
            playerId: id,
            timePassed,
            balls,
            cue: {
                velocity,
                distance,
            }
        };
        this.snaps.push(snap);
    }

    private async replaySnap(snap: PoolSnap) {
        this.sleep();
        snap.balls.forEach(b => {
            const ball = [this.cue, ...this.balls].find(bb => bb.name == b.name);
            if (ball.removed) {
                ball.reset();
            }
            Matter.Body.setPosition(ball.body, b.position);
            Matter.Body.setAngle(ball.body, b.angle);
            Matter.Body.setVelocity(ball.body, b.velocity);
            Matter.Body.setAngularVelocity(ball.body, b.angularVelocity);

            const pos = ball.body.position;
            ball.actor.transform.local.position.x = pos.x * MATTER_TO_MRE;
            ball.actor.transform.local.position.z = pos.y * MATTER_TO_MRE;
        });

        this.balls.forEach(b => {
            if (!b.removed && !snap.balls.find(bb => bb.name == b.name)) {
                b.remove();
            }
        });

        await this.animatePole(snap.cue.distance, snap.cue.velocity);
        const CUE_SOUNDS = prefabs.sounds.cue;
        this.playSound(CUE_SOUNDS[Math.floor(Math.random() * CUE_SOUNDS.length)], this.table);

        this.awake();
        Matter.Body.setVelocity(this.cue.body, snap.cue.velocity);
    }

    private async animatePole(d: any, v: any) {
        // position
        const p = this.cue.body.position;
        const y = TABLE_HEIGHT + BALL_RADIUS;
        const cp = new Vector3(p.x * MATTER_TO_MRE, y, p.y * MATTER_TO_MRE);
        const r1 = REPLAY_CUE_OFFSET / Math.sqrt(v.x * v.x + v.y * v.y);
        const r2 = (REPLAY_CUE_OFFSET + d) / Math.sqrt(v.x * v.x + v.y * v.y);
        const p1 = new Vector3(cp.x - v.x * r1, cp.y, cp.z - v.y * r1);
        const p2 = new Vector3(cp.x - v.x * r2, cp.y, cp.z - v.y * r2);

        this.pole.transform.local.position.copyFrom(p1);
        const LaserResourceId = prefabs.laser;
        const laser = Actor.CreateFromLibrary(this.context, {
            resourceId: LaserResourceId,
            actor: {
                parentId: this.pole.id
            }
        });

        // rotation
        const org = new Vector3(v.x, 0, v.y);
        const ref = new Vector3(0, 0, 1);
        const cross = Vector3.Cross(ref, org);
        const dot = Vector3.Dot(ref, org);
        const w = Math.sqrt(ref.length() ** 2 * org.length() ** 2) + dot;
        this.pole.transform.local.rotation.copyFromFloats(cross.x, cross.y, cross.z, w);

        this.pole.appearance.enabled = true;

        const animationDataLike: AnimationDataLike = {
            tracks: [
                {
                    target: ActorPath("actor").transform.local.position,
                    easing: AnimationEaseCurves.Linear,
                    keyframes: [
                        { time: 0, value: this.pole.transform.local.position },
                        { time: 0.1, value: p1 },
                        { time: 2, value: p2 },
                        { time: 2.1, value: p1 },
                    ],
                },
            ]
        };
        let animationData: AnimationData = this.assets.animationData.find(a => a.name == 'animation_cue');
        if (!animationData) {
            animationData = this.assets.createAnimationData(`animation_cue`, animationDataLike);
        }
        animationData.bind({ actor: this.pole }, {
            isPlaying: true,
            wrapMode: AnimationWrapMode.Once
        });

        await new Promise(resolve => setTimeout(resolve, 1.11 * 1000));
        this.pole.appearance.enabled = false;
        laser.destroy();
    }

    private async replayGame() {
        if (this.playing) { return; }
        this.playing = true;

        this.replayGameHelper(0);
    }

    private async replayGameHelper(i: number) {
        const snap = this.snaps[i];
        await this.replaySnap(snap);

        const time = this.snaps[i + 1] ? this.snaps[i + 1].timePassed : undefined;
        if (time !== undefined) {
            this.timeout = setTimeout(() => {
                this.replayGameHelper(i + 1);
            }, time);
        } else {
            clearTimeout(this.timeout);
            this.timeout = undefined;
            this.playing = false;
        }
    }

    public reattach() {
    }

    public stopped() {
        Runner.stop(this.runner);
    }
}