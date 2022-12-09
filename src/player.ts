/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { Animation, Actor, ColliderType, CollisionLayer, Quaternion, User, Vector3, AnimationEaseCurves, AssetContainer, Context } from "@microsoft/mixed-reality-extension-sdk";
import { prefabs } from "./prefabs";
import { translate } from "./utils";

const PIVOT_OFFSET = 0.1;
const CUE_OFFSET = -0.2;
const VR_TRANFORMS = [
    {
        position: { x: 0, y: 0, z: PIVOT_OFFSET },
        rotation: { x: 0, y: 0, z: 0 }
    },
    {
        position: { x: 0, y: 0, z: CUE_OFFSET },
        rotation: { x: 0, y: 0, z: 0 }
    },
    {
        position: { x: 0, y: 0, z: CUE_OFFSET + PIVOT_OFFSET },
        rotation: { x: 0, y: 0, z: 0 }
    },
];
const _2D_TRANFORMS = [
    {
        position: { x: 0, y: 0, z: PIVOT_OFFSET + 1 },
        rotation: { x: 0, y: 0, z: 0 }
    },
    {
        position: { x: 0, y: -0.1, z: CUE_OFFSET + 1 },
        rotation: { x: -10, y: 0, z: 0 }
    },
    {
        position: { x: 0, y: 0, z: CUE_OFFSET + PIVOT_OFFSET + 1 },
        rotation: { x: 60, y: 0, z: 0 }
    },
];

export interface PlayerOptions {
    user: User,
}

export enum ClientType {
    _2D = "2D",
    VR = "VR"
}

export class Player {
    private pole: Actor;
    private pivot: Actor;
    private grab: Actor;

    public d_world: Vector3;
    public d_local: Vector3;
    public pp: Vector3;
    public pq: Quaternion;

    private interval: NodeJS.Timeout;

    private removed: boolean = false;

    private _type: ClientType = ClientType.VR;
    set type(t: ClientType) {
        this._type = t;
        this.reattach();
    }
    get type() {
        return this._type;
    }

    get user() { return this.options.user; }

    public onFire: () => void;
    public onUpdate: () => void;

    constructor(private context: Context, private assets: AssetContainer, private options: PlayerOptions) {
        this.init(this.options.user);
    }

    private init(user: User) {
        this.createPoleModel(user);
        this.createGrab(user);
        this.pivot = Actor.Create(this.context, {
            actor: {
                transform: {
                    local: {
                        position: { x: 0, y: 0, z: PIVOT_OFFSET },
                        rotation: Quaternion.FromEulerAngles(0, 0, 0),
                    }
                },
                attachment: {
                    userId: user.id,
                    attachPoint: 'left-hand',
                },
                subscriptions: ['transform'],
            },
        });
    }

    private createPoleModel(user: User) {
        const CueResourceIds = prefabs.cues;
        this.pole = Actor.CreateFromLibrary(this.context, {
            resourceId: CueResourceIds['cue1'],
            actor: {
                transform: {
                    local: {
                        position: { x: 0, y: 0, z: CUE_OFFSET },
                        rotation: Quaternion.FromEulerAngles(0, 0, 0),
                    }
                },
                attachment: {
                    userId: user.id,
                    attachPoint: 'left-hand',
                },
            },
        });
        const GrabResourceId = prefabs.grab;
        Actor.CreateFromLibrary(this.context, {
            resourceId: GrabResourceId,
            actor: {
                parentId: this.pole.id,
                transform: {
                    local: {
                        position: { x: 0, y: 0, z: PIVOT_OFFSET }
                    }
                },
            }
        });
    }

    private createGrab(user: User) {
        let mesh = this.assets.meshes.find(m => m.name === 'mesh_grab');
        if (!mesh) {
            mesh = this.assets.createSphereMesh('mesh_grab', 0.05);
        }
        const material = this.assets.materials.find(m => m.name === 'invis');
        const local = translate(this.type === ClientType.VR ? VR_TRANFORMS[2] : _2D_TRANFORMS[2]).toJSON();
        this.grab = Actor.Create(this.context, {
            actor: {
                grabbable: true,
                attachment: {
                    userId: user.id,
                    attachPoint: this.type === ClientType.VR ? 'left-hand' : 'head',
                },
                transform: {
                    local
                },
                appearance: {
                    meshId: mesh.id,
                    materialId: material.id,
                },
                collider: {
                    geometry: { shape: ColliderType.Sphere },
                    layer: CollisionLayer.Hologram
                },
                subscriptions: ['transform']
            }
        });

        this.grab.onGrab('begin', (user, _) => {
            if (this.interval) { clearInterval(this.interval); }
            this.interval = setInterval(() => {
                this.update();
                this.onUpdate();
            }, 1000 / 10);
        });

        this.grab.onGrab('end', (user, _) => {
            clearInterval(this.interval);
            this.fire(user);
        });
    }

    private fire(user: User) {
        this.grab?.destroy();
        this.grab = undefined;
        const local = translate(this.type === ClientType.VR ? VR_TRANFORMS[1] : _2D_TRANFORMS[1]).toJSON();
        Animation.AnimateTo(this.context, this.pole, {
            destination: {
                transform: {
                    local
                },
            },
            duration: 0.1,
            easing: AnimationEaseCurves.Linear
        });

        this.onFire();

        setTimeout(() => {
            if (!this.removed) {
                this.createGrab(user);
            }
        }, 2 * 1000);
    }

    private update() {
        const gp = this.grab.transform.app.position;
        this.pp = this.pivot.transform.app.position;
        this.pq = this.pivot.transform.app.rotation;
        let pq_conj = new Quaternion(); this.pq.conjugateToRef(pq_conj);

        const v = gp.subtract(this.pp);
        this.d_local = new Vector3();
        v.rotateByQuaternionToRef(pq_conj, this.d_local);
        this.d_local.x = 0; this.d_local.y = 0;

        this.d_world = new Vector3();
        this.d_local.rotateByQuaternionToRef(this.pq, this.d_world);

        this.pole.transform.local.position.z = this.type === ClientType.VR ? this.d_local.z : this.d_local.z * 0.4 + CUE_OFFSET + 1;
    }

    public reattach() {
        [this.pivot, this.pole, this.grab].forEach((a, i) => {
            if (!a) { return; }
            if (a.attachment && a.attachment.attachPoint) {
                a.detach();
            }
            a.attach(this.options.user, this.type === ClientType.VR ? 'left-hand' : 'head');
            const local = translate(this.type === ClientType.VR ? VR_TRANFORMS[i] : _2D_TRANFORMS[i]);
            a.transform.local.copy(local);
        });
    }

    public remove() {
        if (this.interval) {
            clearInterval(this.interval);
        }

        this.removed = true;
        this.grab?.destroy();
        this.pole.destroy();
        this.pivot.destroy();
    }
}
