/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { AssetContainer, Context, User } from "@microsoft/mixed-reality-extension-sdk";
import { PoolUserData } from "../db";
import { AssetData, Button, Menu, MenuOptions, Pager, PaginatedTable, Table, Text, ViewElement } from "altvr-gui";
import { fetchText } from "../utils";

export interface PlayerMenuOptions extends MenuOptions {
    replay_menu_url: string,
    about_menu_url: string,
    leaderboard_menu_url: string,
}

const ABOUT_TEXT = "\
To join the game, click the cue on the sides of the pool table.\n\
To Shoot the pool, get near the cue ball,\
pull then release cue like a bow and arrow.\n\
The Further back you pull the harder you'll hit the cue ball.\n\
\n\
MRE by @Luminosity\n\
For more games like this, please check out my website: \
https://freemre.com \
";

export class PoolMenu extends Menu {
    private popupView: ViewElement;
    private sideView: ViewElement;

    private replayMenuXML: string;
    private _replay: boolean = false;

    private leaderBoardMenuXML: string;
    private _leaderBoard: boolean = false;
    public playerListTable: Table;
    public playerList: PaginatedTable;

    private aboutMenuXML: string;
    private _about: boolean = false;

    get replay(){
        return this._replay;
    }

    set replay(b: boolean){
        this._replay = b;
        if (this._replay){
            this.createReplayMenu();
        } else {
            this.removeReplayMenu();
        }
    }

    get leaderBoard(){
        return this._leaderBoard;
    }

    set leaderBoard(b: boolean){
        this._leaderBoard = b;
        if (this._leaderBoard){
            this.createLeaderBoardMenu();
        } else {
            this.removeLeaderBoardMenu();
        }
    }

    get about(){
        return this._about;
    }

    set about(b: boolean){
        this._about = b;
        if (this._about){
            this.createAboutMenu();
        } else {
            this.removeAboutMenu();
        }
    }

    public onAction: (act: string, user: User, params?: any) => void;
    public checkUser: (user: User) => boolean;
    public getLeaderboard: () => Promise<PoolUserData[]>;

    constructor(context: Context, assets: AssetContainer, options: PlayerMenuOptions, owner: User){
        super(context, assets, options, owner);
    }

    public async rendered(){
        const replayButton = this.view.root.find('#replay')[0] as Button;
        replayButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            if (!this.checkUser(params.user)){ params.user.prompt("This button won't work unless you join the game."); return; }
            this.replay = !this.replay;
        });

        const leaderBoardButton = this.view.root.find('#leaderboard')[0] as Button;
        leaderBoardButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            if (!this.checkUser(params.user)){ params.user.prompt("This button won't work unless you join the game."); return; }
            this.leaderBoard = !this.leaderBoard;
        });

        const aboutButton = this.view.root.find('#about')[0] as Button;
        aboutButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.about = !this.about;
        });

        const restartButton = this.view.root.find('#reset')[0] as Button;
        restartButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('reset', params.user);
        });

        const _2DButton = this.view.root.find('#2d')[0] as Button;
        _2DButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('2d', params.user);
        });

        // popup
        this.popupView = this.view.root.find('#popup')[0];

        // side
        this.sideView = this.view.root.find('#side')[0];

        let url = (this.options as PlayerMenuOptions).replay_menu_url;
        url = url.split('://').length > 1 ? url : `${this.options.baseUrl}/${url}`;
        this.replayMenuXML = await fetchText(url);

        url = (this.options as PlayerMenuOptions).about_menu_url;
        url = url.split('://').length > 1 ? url : `${this.options.baseUrl}/${url}`;
        this.aboutMenuXML = await fetchText(url);

        url = (this.options as PlayerMenuOptions).leaderboard_menu_url;
        url = url.split('://').length > 1 ? url : `${this.options.baseUrl}/${url}`;
        this.leaderBoardMenuXML = await fetchText(url);
    }

    private async createReplayMenu(){
        if (this.popupView.find('#replay_menu').length > 0){ return; }
        this.leaderBoard = false;

        this.popupView.append(this.replayMenuXML);

        const loadButton = this.popupView.find('#load')[0] as Button;
        loadButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('load', params.user);
        });

        const saveButton = this.popupView.find('#save')[0] as Button;
        saveButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('save', params.user);
        });

        const replayButton = this.popupView.find('#play')[0] as Button;
        replayButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('replay', params.user);
        });

        const pauseButton = this.popupView.find('#pause')[0] as Button;
        pauseButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('pause', params.user);
        });

        const restartButton = this.popupView.find('#restart')[0] as Button;
        restartButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('restart', params.user);
        });

        const endButton = this.popupView.find('#end')[0] as Button;
        endButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('end', params.user);
        });

        const prevButton = this.popupView.find('#prev')[0] as Button;
        prevButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('prev', params.user);
        });

        const nextButton = this.popupView.find('#next')[0] as Button;
        nextButton.addUIEventHandler('click', (params: {user: User, id: string})=>{
            this.onAction('next', params.user);
        });
    }

    private removeReplayMenu(){
        this.popupView.find('#replay_menu').forEach(e=>e.remove());
    }

    private async createLeaderBoardMenu(){
        if (this.popupView.find('#leaderboard').length > 0){ return; }
        this.replay = false;

        this.popupView.append(this.leaderBoardMenuXML);

        this.playerListTable = this.popupView.find('#player_list_table')[0] as Table;
        const playerPager = this.popupView.find('#player_list_pager')[0] as Pager;
        await this.playerListTable.created();

        if (!this.playerList){
            this.playerList = new PaginatedTable({
                list: this.playerListTable,
                pager: playerPager,
                pageSize: 10,
            });
        }

        const results = await this.getLeaderboard();
        const items = results.map((r,i)=>({
            rank: i+1,
            name: r.name.substr(0,23),
            wins: r.wins,
            winrate: `${(r.wins/r.games*100).toFixed(2)}%`,
            pots: r.pots,
            accuracy: `${(r.pots/r.shots*100).toFixed(2)}%`,
        }));

        this.playerList.items = items;
        this.playerList.pageNum = 0;
        this.playerList.update();
    }

    private removeLeaderBoardMenu(){
        this.popupView.find('#leaderboard').forEach(e=>e.remove());
        this.playerList = undefined;
    }

    private async createAboutMenu(){
        if (this.sideView.find('#about_menu').length > 0){ return; }
        this.sideView.append(this.aboutMenuXML);

        const [text, height] = this.formatText(ABOUT_TEXT, 1.30, 0.56);
        const helpText = this.sideView.find('#about_text')[0] as Text;
        helpText.text(text as string);
        helpText.textHeight(height as number);
    }

    private removeAboutMenu(){
        this.sideView.find('#about_menu').forEach(e=>e.remove());
    }

    private formatText(text: string, width: number, height: number) {
        const MAX_TEXHEIGHT = 0.042;
        const HeightToWidth = 0.6;
        const step = 0.0001;
        const textHeights = [...Array(40).keys()].map(i=>{
            return MAX_TEXHEIGHT-step*i;
        });

        // greedy bin packing
        let textHeight = 0;
        let res = '';
        for (let i=0; i<textHeights.length; i++){
            textHeight = textHeights[i];

            const rows = [];
            let words = text.split(/[^\S\r\n]/);
            let splits = 0;
            let row: string[] = [];
            for (let j=0, l=0; j<words.length;){
                if (words[j].length >= 99 || words[j].length*textHeight*HeightToWidth > width) {
                    const splitPoint = Math.floor(width/textHeight);
                    if (words[j].length < 99) { splits++; }
                    words = [
                        ...words.slice(0,j),
                        words[j].slice(0, splitPoint) + (words[j].length >= 16 ? '-' : ''),
                        words[j].slice(splitPoint),
                        ...words.slice(j+1)
                    ];
                }

                if (
                    (l + words[j].length)*textHeight*HeightToWidth <= width &&
                    words[j] != "\n"
                ){
                    l += words[j].length;
                    row.push(words[j]);
                    j++;
                } else {
                    if (words[j] == "\n"){ j++; }
                    rows.push(row);
                    row = [];
                    l = 0;
                }
            }
            if (row.length > 0) { rows.push(row); }

            if (textHeight*rows.length <= height){
                res = rows.reduce((a,c)=>{
                    return a + c.join(' ')+'\n';
                }, '');
                if (splits <= 0) { break; }
            }
        }

        return [res, textHeight];
    }

    public reset(){
    }

    public remove(){
    }
}