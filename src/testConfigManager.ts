// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from 'fs-extra';
import * as path from 'path';
import { QuickPickItem, Uri, window, workspace, WorkspaceFolder } from 'vscode';
import { ITestItem } from './protocols';
import { IExecutionConfig, IExecutionConfigGroup, ITestConfig } from './runConfigs';

class TestConfigManager {
    private readonly configRelativePath: string;
    constructor() {
        this.configRelativePath = path.join('.vscode', 'launch.test.json');
    }
    public get configPath(): string {
        return this.configRelativePath;
    }

    // The test items that belong to a test runner, here the test items should be in the same workspace folder.
    public async loadRunConfig(tests: ITestItem[], isDebug: boolean, usingDefaultConfig: boolean): Promise<IExecutionConfig | undefined> {
        const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(Uri.parse(tests[0].uri));
        if (!workspaceFolder) {
            return undefined;
        }

        const configs: IExecutionConfig[] | undefined = workspace.getConfiguration('java.test', workspaceFolder.uri).get<IExecutionConfig[]>('config');
        if (configs && configs.length > 0) {
            // Use the new config schema
            if (usingDefaultConfig) {
                return configs[0];
            }
            return await this.selectQuickPick(configs);
        } else {
            // Using deprecated config shcema
            // TODO: show hint for using deprecated configuration
            const deprecatedConfigs: IExecutionConfigGroup[] = [];
            const configFullPath: string = path.join(workspaceFolder.uri.fsPath, this.configRelativePath);
            if (!await fse.pathExists(configFullPath)) {
                return undefined;
            }
            const content: string = await fse.readFile(configFullPath, 'utf-8');
            const deprecatedConfig: ITestConfig = JSON.parse(content);
            deprecatedConfigs.push(isDebug ? deprecatedConfig.debug : deprecatedConfig.run);
            return await this.selectDeprecatedConfig(deprecatedConfigs, usingDefaultConfig);
        }
    }

    private async selectDeprecatedConfig(configs: IExecutionConfigGroup[], usingDefaultConfig: boolean): Promise<IExecutionConfig | undefined> {
        if (configs.length === 0) {
            return undefined;
        }
        if (usingDefaultConfig) {
            if (configs.length !== 1 || !configs[0].default) {
                return undefined;
            }
            const runConfig: IExecutionConfigGroup = configs[0];
            const candidates: IExecutionConfig[] = runConfig.items.filter((item: IExecutionConfig) => item.name === runConfig.default);
            if (candidates.length === 0) {
                window.showWarningMessage(`There is no config with name: ${runConfig.default}.`);
                return undefined;
            }
            if (candidates.length > 1) {
                window.showWarningMessage(`Duplicate configs with default name: ${runConfig.default}.`);
            }
            return candidates[0];
        }

        if (configs.length > 1) {
            window.showWarningMessage('It is not supported to run tests with config from multi root.');
        }

        const configItems: IExecutionConfig[] = [];
        for (const config of configs) {
            configItems.push(...config.items);
        }
        return this.selectQuickPick(configItems);
    }

    private async selectQuickPick(configs: IExecutionConfig[]): Promise<IExecutionConfig> {
        interface IRunConfigQuickPick extends QuickPickItem {
            item: IExecutionConfig;
        }

        const choices: IRunConfigQuickPick[] = [];
        for (let i: number = 0; i < configs.length; i++) {
            const label: string = configs[i].name ? configs[i].name! : `Configuration #${i + 1}`;
            choices.push({
                label,
                detail: JSON.stringify(configs[i]),
                item: configs[i],
            });
        }
        const selection: IRunConfigQuickPick | undefined = await window.showQuickPick(choices, { placeHolder: 'Select test config' });
        if (!selection) {
            throw new Error('Please specify the test config to use.');
        }
        return selection.item;
    }
}

export const testConfigManager: TestConfigManager = new TestConfigManager();
