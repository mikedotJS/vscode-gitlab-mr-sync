// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import axios from "axios";

let commentId = 1;

class Comment implements vscode.Comment {
  label: string | undefined;
  constructor(
    public id: number,
    public body: string | vscode.MarkdownString,
    public mode: vscode.CommentMode,
    public author: vscode.CommentAuthorInformation,
    public parent?: vscode.CommentThread,
    public contextValue?: string
  ) {}
}

class CommentThread implements vscode.CommentThread {
  constructor(
    public id: string,
    public uri: vscode.Uri,
    public range: vscode.Range,
    public comments: vscode.Comment[],
    public collapsibleState: vscode.CommentThreadCollapsibleState,
    public dispose: () => void
  ) {}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "gitlab-mr-sync" is now active!'
  );

  const commentController = vscode.comments.createCommentController(
    "comment-sample",
    "Comment API Sample"
  );
  context.subscriptions.push(commentController);

  commentController.commentingRangeProvider = {
    provideCommentingRanges: (
      document: vscode.TextDocument,
      token: vscode.CancellationToken
    ) => {
      let lineCount = document.lineCount;
      return [new vscode.Range(0, 0, lineCount - 1, 0)];
    }
  };

  const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
  const api = gitExtension.getAPI(1);

  const rootPath = vscode.workspace.rootPath;
  const repository = api.repositories.find(
    (_repository: any) => _repository.rootUri.fsPath === rootPath
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "extension.helloWorld",
    async () => {
      // The code you place here will be executed every time your command is executed
      // Ask user to paste GitLab API access token
      const gitlabAPIAccessToken = await vscode.window.showInputBox({
        placeHolder: "GitLab Access Token"
      });

      const gitlabDomain = await vscode.window.showInputBox({
        placeHolder: "Your GitLab domain (eg: gitlab.example.com)"
      });

      const projectId = await vscode.window.showInputBox({
        placeHolder: "Project ID"
      });

      const currentBranchName = (await repository.getBranch("HEAD")).name;

      const { data: mergeRequests } = await axios.get(
        `https://${gitlabDomain}/api/v4/projects/${projectId}/merge_requests?private_token=${gitlabAPIAccessToken}&source_branch=${currentBranchName}`
      );

      const mergeRequestIid = mergeRequests[0]?.iid;

      const { data }: { data: any[] } = await axios.get(
        `https://${gitlabDomain}/api/v4/projects/${projectId}/merge_requests/${mergeRequestIid}/discussions?private_token=${gitlabAPIAccessToken}`
      );

      const discussions = data.filter(({ notes }) =>
        notes.every(({ position }: { position: any }) => Boolean(position))
      );

      try {
        const threads = discussions?.map(discussion => {
          const line = discussion.notes[0].position.new_line;
          return new CommentThread(
            discussion.id,
            vscode.Uri.parse(
              vscode.workspace.rootPath +
                "/" +
                discussion.notes[0].position.new_path
            ),
            new vscode.Range(
              new vscode.Position(line, 0),
              new vscode.Position(line, discussion.notes[0].body.length)
            ),
            [],
            vscode.CommentThreadCollapsibleState.Collapsed,
            () => {}
          );
        });

        const comments = discussions?.map(discussion => {
          const thread = threads?.find(_thread => _thread.id === discussion.id);

          return {
            threadId: discussion.id,
            comments: discussion.notes.map(
              (note: any) =>
                new Comment(
                  note.id,
                  note.body,
                  vscode.CommentMode.Preview,
                  {
                    name: note.author.name
                  },
                  thread,
                  undefined
                )
            )
          };
        });

        comments?.forEach(({ threadId, comments }) => {
          const thread = threads?.find(_thread => _thread.id === threadId);
          if (thread)
            commentController.createCommentThread(
              thread.uri,
              thread.range,
              comments
            );
        });
      } catch (error) {
        console.error(error);
      }
    }
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
