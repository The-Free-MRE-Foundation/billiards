/*!
 * Copyright (c) The Free MRE Foundation. All rights reserved.
 * Licensed under the GPLv3 License.
 */

import { AlphaMode, AssetContainer, Color3, Color4, Context, ParameterSet, User } from "@microsoft/mixed-reality-extension-sdk";
import { AssetData } from "altvr-gui";
import { Pool } from "./pool";
import { prefabs } from "./prefabs";
import { fetchJSON } from "./utils";

/**
 * The main class of this app. All the logic goes here.
 */
export default class App {
    private assets: AssetContainer;
    private uiassets: { [name: string]: AssetData } = {};
    private pool: Pool;
    private poolTableResourceId: string;

    constructor(private context: Context, params: ParameterSet, private baseurl: string) {
        this.assets = new AssetContainer(context);
        this.poolTableResourceId = params['resourceId'] as string;
        this.context.onStarted(() => this.started());
        this.context.onUserJoined((u: User) => this.userjoined(u));
        this.context.onUserLeft((u: User) => this.userleft(u));
        this.context.onStopped(() => this.stopped());
    }

    /**
     * Once the context is "started", initialize the app.
     */
    private async started() {
        await this.loadMaterials();
        await this.loadUIAssets(`${this.baseurl}/uiassets.json`);
        this.pool = new Pool(this.context, this.assets, {
            poolTableResourceId: this.poolTableResourceId ? this.poolTableResourceId : prefabs.table
        }, this.uiassets, this.baseurl);
    }

    private async stopped() {
        this.pool.stopped();
    }

    private async userjoined(user: User) {
    }

    private async userleft(user: User) {
    }

    private async loadMaterials() {
        this.assets.createMaterial('invis', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
        this.assets.createMaterial('highlight', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
        // this.context.assets.createMaterial('trans_red', { color: Color4.FromColor3(Color3.Red(), 0.1), alphaMode: AlphaMode.Blend });
        this.assets.createMaterial('trans_red', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
        this.assets.createMaterial('debug', { color: Color4.FromColor3(Color3.Teal(), 0.3), alphaMode: AlphaMode.Blend });
        this.assets.createMaterial('gray', { color: Color3.DarkGray() });
    }

    private async loadUIAssets(url: string) {
        const uiassets = await fetchJSON(url);
        uiassets.forEach((a: any) => {
            this.uiassets[a.name] = a;
        });
    }
}
