/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { Actor, AssetContainer, Context, ScaledTransformLike, User, Vector2Like } from "@microsoft/mixed-reality-extension-sdk";
import { MATTER_TO_MRE } from "./pool";
import { prefabs } from "./prefabs";
const Matter = require('matter-js');
const Bodies = Matter.Bodies;
const Composite = Matter.Composite;

export enum BallColor {
    ORANGE = "ORANGE",
    BLUE = "BLUE",
    BLACK = "BLACK",
    WHITE = "WHITE"
}

export const BallColors: {[name: string]: string} = {
    "1": BallColor.BLUE,
    "2": BallColor.BLUE,
    "3": BallColor.ORANGE,
    "4": BallColor.ORANGE,
    "5": BallColor.BLACK,
    "6": BallColor.BLUE,
    "7": BallColor.BLUE,
    "8": BallColor.ORANGE,
    "9": BallColor.BLUE,
    "10": BallColor.ORANGE,
    "11": BallColor.ORANGE,
    "12": BallColor.BLUE,
    "13": BallColor.ORANGE,
    "14": BallColor.BLUE,
    "15": BallColor.ORANGE,
}

export const BallResourceIds: { [name: string] : string } = {
    "1":  prefabs.balls.blue,
    "2":  prefabs.balls.blue,
    "3":  prefabs.balls.orange,
    "4":  prefabs.balls.orange,
    "5":  prefabs.balls.black,
    "6":  prefabs.balls.blue,
    "7":  prefabs.balls.blue,
    "8":  prefabs.balls.orange,
    "9":  prefabs.balls.blue,
    "10": prefabs.balls.orange,
    "11": prefabs.balls.orange,
    "12": prefabs.balls.blue,
    "13": prefabs.balls.orange,
    "14": prefabs.balls.blue,
    "15": prefabs.balls.orange,
    "cue": prefabs.balls.cue,
};

export const BALL_RADIUS = 0.03;
export interface BallState {
    name: string,
    position: Vector2Like,
    angle: number,
    velocity: Vector2Like,
    angularVelocity: number,
}

export interface BallOptions {
    name: string,
    engine: any,
    resourceId: string,
    transform: Partial<ScaledTransformLike>,
}

export class Ball {
    private engine: any;

    public body: any;
    public actor: Actor;

    private _removed: boolean = false;

    get removed(){ return this._removed; }

    get name(){
        return this.options.name;
    }

    constructor(private context: Context, private assets: AssetContainer, private options: BallOptions) {
        this.engine = this.options.engine;
        this.createBall(this.options.resourceId, this.options.transform);
    }

    private createBall(resourceId: string, transform: Partial<ScaledTransformLike>){
        let mesh = this.assets.meshes.find(m => m.name === 'mesh_ball');
        if (!mesh) {
            mesh = this.assets.createSphereMesh('mesh_ball', BALL_RADIUS);
        }
        const material = this.assets.materials.find(m => m.name === 'invis');
        const pos = transform.position ? transform.position : {x: 0, y: 0, z: 0};
        this.body = Bodies.circle(pos.x / MATTER_TO_MRE, pos.z / MATTER_TO_MRE, BALL_RADIUS / MATTER_TO_MRE, { label: "ball", restitution: 0.92, frictionAir: 0.013, friction: 0.01, slop: 0 });
        Composite.add(this.engine.world, [this.body]);
        this.actor = Actor.Create(this.context, {
            actor:{ 
                appearance: {
                    meshId: mesh.id,
                    materialId: material.id
                },
                transform: {
                    local: transform
                },
            },
        });
        Actor.CreateFromLibrary(this.context, {
            resourceId,
            actor: {
                parentId: this.actor.id,
            }
        });
    }

    public remove(delay: number=0){
        this.actor.destroy();
        if (delay <= 0){
            Matter.Composite.remove(this.engine.world, this.body);
        } else {
            setTimeout(()=>{
                Matter.Composite.remove(this.engine.world, this.body);
            }, delay);
        }
        this._removed = true;
    }

    public reset(){
        this.remove();
        this.createBall(this.options.resourceId, this.options.transform);
        this._removed = false;
    }
}
