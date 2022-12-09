/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { User } from '@microsoft/mixed-reality-extension-sdk';
import { MongoClient } from 'mongodb';
import { BallColor, BallColors, BallState } from './ball';
import { PoolSnap } from './pool';
import { Async } from './utils';

const TOP_N = 100;

export interface PoolGameData {
    id: string,
    players: {[id: number]: string},
    snaps: PoolSnap[],
}

export interface PoolUserData {
    name: string,
    shots: number,
    pots: number,
    games: number,
    wins: number,
}

export interface PoolDBOptions {
    host?: string,
    port?: string,
    user: string,
    password: string,
    database: string,
}

export class PoolDB extends Async{
    // db
    private client: MongoClient;
    private connection: MongoClient;

    constructor(private options: PoolDBOptions) {
        super();
        this.init();
    }

    private async init(){
        this.client = await this.createClient();
        this.notifyCreated(true);
    }

    private async createClient(){
        if (this.client){ 
            await this.client.close();
        }
        const host = this.options.host ? this.options.host : '127.0.0.1';
        const port = this.options.port ? this.options.port : '27017';
        const uri = `mongodb://${this.options.user}:${this.options.password}@${host}:${port}?writeConcern=majority`;
        return new MongoClient(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    }

    public async submitGameResult(result: PoolGameData): Promise<void>{
        const stats = this.analyzeGameResult(result);
        if (!stats){ return; }
        for(let i=0; i<stats.length; i++){
            const {name, pots, shots, winner} = stats[i];
            // native mongodb driver
            try {
                // connect
                if (this.connection === undefined){
                    this.connection = await this.client.connect();
                }
                const db = this.client.db(this.options.database);

                // query
                const collection = db.collection('stats');
                const cursor = collection.find({name});
                const stats: PoolUserData[] = [];
                await cursor.forEach(d=>stats.push(d));

                // new
                let stat: PoolUserData;
                if (stats.length <= 0){
                    stat = {
                        name,
                        pots,
                        shots,
                        wins: winner ? 1 : 0,
                        games: 1
                    };
                } else {
                    stat = {
                        name,
                        pots: stats[0].pots + pots,
                        shots: stats[0].shots + shots,
                        wins: stats[0].wins + (winner ? 1 : 0),
                        games: stats[0].games + 1,
                    }
                }

                // update
                const query = {name};
                const options = { upsert: true };
                await collection.updateOne(query, { $set: stat }, options);
            } catch (err) {
                console.log(err);
            }
        }
    }

    public async fetchUserData(): Promise<PoolUserData[]>{
        // native mongodb driver
        try {
            if (this.connection === undefined){
                this.connection = await this.client.connect();
            }
            const db = this.client.db(this.options.database);
            const collection = db.collection('stats');
            const query = {};
            const options = {
                sort: { pots: -1 },
            };
            const cursor = collection.find(query, options).limit(TOP_N);
            const res: PoolUserData[] = [];
            await cursor.forEach(d=>res.push(d));
            // return res.sort((a,b)=>b.pots/b.shots - a.pots/a.shots);
            return res;
        } catch (err){
            console.log(err);
        }
    }

    private analyzeGameResult(result: PoolGameData){
        if (Object.keys(result.players).length < 2){ return; } // pvp

        const snaps = result.snaps;
        const potted : {[name: string]: BallState[]} = {};

        let balls = snaps[0].balls;
        let playerId = snaps[0].playerId;

        for (let i=1; i<snaps.length; i++){
            const snap = snaps[i];
            const pots = balls.filter(b=>{
                return snap.balls.find(sb=>sb.name == b.name)==undefined;
            });
            if (!potted[playerId]){
                potted[playerId] = [];
            }
            potted[playerId] = [...potted[playerId], ...pots];

            balls = snap.balls;
            playerId = snap.playerId;
        }

        const won =
            !(balls.some(b=>BallColors[b.name] == BallColor.ORANGE) &&
            balls.some(b=>BallColors[b.name] == BallColor.BLUE));

        return Object.keys(potted).map((pid: string) => {
            const name = result.players[parseInt(pid)];
            const np = potted[pid].length;
            const no = potted[pid].filter(b=>BallColors[b.name]==BallColor.ORANGE).length;
            const color = no/np > 0.5 ? BallColor.ORANGE : BallColor.BLUE;

            const pots = no/np > 0.5 ? no : np-no;
            const shots = snaps.filter(s=>s.playerId == parseInt(pid)).length;
            const winner = parseInt(pid) == playerId ? won : !won;
            return {name, pots, shots, winner};
        });
    }

    public async saveGame(name: string, user: User, sessionId: string, data: string){
        try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(this.options.database);
			const gamesCollection = db.collection('games');
            const spaceId = user.properties['altspacevr-space-id'];
            await gamesCollection.updateOne(
				{ name, spaceId, sessionId },
				{
					$set: {
                        name,
						spaceId,
						sessionId,
						data,
					}
				},
				{ upsert: true }
			);
			console.log('saved game');
		} catch (err) {
			console.log(err);
		}
    }

    public async loadGame(name: string, user: User, sessionId: string){
        try {
			if (this.connection === undefined) {
				this.connection = await this.client.connect();
			}
			const db = this.client.db(this.options.database);
			const gamesCollection = db.collection('games');
            const spaceId = user.properties['altspacevr-space-id'];
			const res = gamesCollection.findOne({name, spaceId, sessionId});
			console.log('got game', name);
            return res;
		} catch (err) {
			console.log(err);
		}
    }
}