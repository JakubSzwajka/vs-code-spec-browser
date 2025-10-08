import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface SpecNode {
    label: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    filePath?: string;
    status?: string;
    children?: SpecNode[];
    isDirectory?: boolean;
    summary?: { completed: number; inProgress: number; pending: number; other: number; total: number };
}

class SpecsProvider implements vscode.TreeDataProvider<SpecNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<SpecNode | undefined | void> = new vscode.EventEmitter<SpecNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<SpecNode | undefined | void> = this._onDidChangeTreeData.event;
    private hideCompleted: boolean = false;
    private expandAll: boolean = false;
    private parentMap: Map<string, SpecNode> = new Map();
    private isExpanded: boolean = false;

    constructor(private specsPath: string) {}

    setSpecsPath(path: string) {
        this.specsPath = path;
        this.parentMap.clear();
    }

    toggleHideCompleted() {
        this.hideCompleted = !this.hideCompleted;
        this.refresh();
        return this.hideCompleted;
    }

    toggleExpandAll() {
        this.isExpanded = !this.isExpanded;
        this.refresh();
        return this.isExpanded;
    }

    refresh(): void {
        this.parentMap.clear();
        this._onDidChangeTreeData.fire();
    }

    getParent(element: SpecNode): vscode.ProviderResult<SpecNode> {
        if (!element.filePath) {
            return undefined;
        }
        return this.parentMap.get(element.filePath);
    }

    getTreeItem(element: SpecNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, element.collapsibleState);

        if (element.isDirectory) {
            // For directories, try to open README.md
            const readmePath = path.join(element.filePath!, 'README.md');
            if (fs.existsSync(readmePath)) {
                item.command = {
                    command: 'vscode.open',
                    title: 'Open README',
                    arguments: [vscode.Uri.file(readmePath)]
                };
            }
            // Show summary as text
            if (element.summary) {
                const parts = [];
                if (element.summary.completed > 0) {
                    parts.push(`✓${element.summary.completed}`);
                }
                if (element.summary.inProgress > 0) {
                    parts.push(`⏱${element.summary.inProgress}`);
                }
                if (element.summary.pending > 0) {
                    parts.push(`○${element.summary.pending}`);
                }
                if (element.summary.other > 0) {
                    parts.push(`●${element.summary.other}`);
                }
                item.description = parts.join(' ');
            }
        } else if (element.filePath) {
            // For files, open them directly
            item.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(element.filePath)]
            };

            // Add status icon
            if (element.status) {
                const statusLower = element.status.toLowerCase();
                if (statusLower.includes('complete') || statusLower.includes('done')) {
                    item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                } else if (statusLower.includes('progress') || statusLower.includes('wip')) {
                    item.iconPath = new vscode.ThemeIcon('clock', new vscode.ThemeColor('testing.iconQueued'));
                } else if (statusLower.includes('pending') || statusLower.includes('todo')) {
                    item.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('testing.iconUnset'));
                } else {
                    item.iconPath = new vscode.ThemeIcon('circle-filled');
                }
                item.description = element.status;
            }
        }
        return item;
    }

    getChildren(element?: SpecNode): Thenable<SpecNode[]> {
        if (!this.specsPath) {
            return Promise.resolve([]);
        }
        if (!element) {
            // Top-level: list spec folders
            let folders = fs.readdirSync(this.specsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => {
                    const folderPath = path.join(this.specsPath, dirent.name);

                    // Calculate summary
                    const summary = this.calculateSummary(folderPath);

                    return {
                        label: dirent.name,
                        collapsibleState: this.isExpanded
                            ? vscode.TreeItemCollapsibleState.Expanded
                            : vscode.TreeItemCollapsibleState.Collapsed,
                        filePath: folderPath,
                        isDirectory: true,
                        summary
                    };
                });

            // If hiding completed, filter out folders where all files are completed
            if (this.hideCompleted) {
                folders = folders.filter(folder => {
                    const summary = folder.summary!;
                    // Keep folder if it has any non-completed items
                    return summary.inProgress > 0 || summary.pending > 0 || summary.other > 0;
                });
            }

            return Promise.resolve(folders);
        } else {
            // Inside a spec folder: show .md files, parse status
            let files = fs.readdirSync(element.filePath!, { withFileTypes: true })
                .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))
                .map(dirent => {
                    const filePath = path.join(element.filePath!, dirent.name);
                    const content = fs.readFileSync(filePath, 'utf8');
                    let status;
                    try {
                        const match = content.match(/---\n([\s\S]*?)\n---/);
                        if (match) {
                            const meta = yaml.load(match[1]) as any;
                            status = meta.status || '';
                        }
                    } catch (e) { status = ''; }
                    const fileNode = {
                        label: dirent.name,
                        collapsibleState: vscode.TreeItemCollapsibleState.None,
                        filePath,
                        status,
                        isDirectory: false
                    };
                    // Track parent
                    this.parentMap.set(filePath, element);
                    return fileNode;
                });

            // Filter out completed if hideCompleted is true
            if (this.hideCompleted) {
                files = files.filter(file => {
                    const statusLower = (file.status || '').toLowerCase();
                    return !(statusLower.includes('complete') || statusLower.includes('done'));
                });
            }

            return Promise.resolve(files);
        }
    }

    private calculateSummary(folderPath: string): { completed: number; inProgress: number; pending: number; other: number; total: number } {
        let completed = 0;
        let inProgress = 0;
        let pending = 0;
        let other = 0;
        let total = 0;

        try {
            const files = fs.readdirSync(folderPath, { withFileTypes: true })
                .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'));

            files.forEach(file => {
                const filePath = path.join(folderPath, file.name);
                const content = fs.readFileSync(filePath, 'utf8');
                total++;

                try {
                    const match = content.match(/---\n([\s\S]*?)\n---/);
                    if (match) {
                        const meta = yaml.load(match[1]) as any;
                        const status = (meta.status || '').toLowerCase();

                        if (status.includes('complete') || status.includes('done')) {
                            completed++;
                        } else if (status.includes('progress') || status.includes('wip')) {
                            inProgress++;
                        } else if (status.includes('pending') || status.includes('todo')) {
                            pending++;
                        } else if (status) {
                            other++;
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            });
        } catch (e) {
            // Ignore read errors
        }

        return { completed, inProgress, pending, other, total };
    }
}

let specsProvider: SpecsProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Spec Browser extension is now active!');

    // Try to restore saved specs path
    const savedPath = context.workspaceState.get<string>('specsDirectory') ||
                      context.globalState.get<string>('specsDirectory') || '';

    // Initialize provider with saved path
    specsProvider = new SpecsProvider(savedPath);
    const treeView = vscode.window.createTreeView('specsSidebar', {
        treeDataProvider: specsProvider
    });

    console.log('Tree data provider registered for specsSidebar');
    if (savedPath) {
        console.log('Restored specs path:', savedPath);
    }

    // Select Specs Directory command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.selectSpecsDirectory', async () => {
            console.log('Select Specs Directory command executed');
            const folder = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                openLabel: 'Select Specs Directory'
            });
            if (folder && folder.length > 0) {
                const specsPath = folder[0].fsPath;
                console.log('Selected specs path:', specsPath);

                // Save to both workspace and global state
                context.workspaceState.update('specsDirectory', specsPath);
                context.globalState.update('specsDirectory', specsPath);

                specsProvider.setSpecsPath(specsPath);
                specsProvider.refresh();
                vscode.window.showInformationMessage(`Specs directory set to: ${specsPath}`);
            }
        })
    );

    // Expand/Collapse All Specs command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.expandAllSpecs', async () => {
            const wasExpanded = specsProvider['isExpanded'];
            const isExpanded = specsProvider.toggleExpandAll();

            // Get all top-level folders after refresh
            const folders = await specsProvider.getChildren();

            if (isExpanded && !wasExpanded) {
                // Expand all using reveal
                for (const folder of folders) {
                    try {
                        await treeView.reveal(folder, { select: false, focus: false, expand: 1 });
                    } catch (e) {
                        // Ignore errors
                    }
                }
            }

            vscode.window.showInformationMessage(
                isExpanded ? 'Expanded all specs' : 'Collapsed all specs'
            );
        })
    );

    // Hide/Show Completed command
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.hideCompleted', () => {
            const isHiding = specsProvider.toggleHideCompleted();
            vscode.window.showInformationMessage(
                isHiding ? 'Completed specs hidden' : 'Showing all specs'
            );
        })
    );

    context.subscriptions.push(treeView);
}

export function deactivate() {}
