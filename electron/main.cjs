const { app, BrowserWindow } = require("electron");
const path = require("path");

const SMOKE = process.argv.includes("--smoke");

app.setName("VISTON Studio");
app.setAppUserModelId("com.viston.studio");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#16181d",
    autoHideMenuBar: true,
    title: "VISTON Studio — Image Editor",
    icon: path.join(__dirname, "..", "public", "icons", "viston-ms-512.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  if (SMOKE) {
    const consoleLines = [];
    win.webContents.on("console-message", (_e, _level, message) => {
      consoleLines.push(message);
    });
    win.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          const result = await win.webContents.executeJavaScript(`(() => {
            const root = document.getElementById("root");
            return {
              title: document.title,
              url: location.href,
              rootExists: !!root,
              rootChildCount: root ? root.childElementCount : -1,
              workspacePresent: !!document.querySelector(".vs-workspace"),
              canvasCount: document.querySelectorAll("canvas").length,
              busyOverlay: !!document.querySelector(".vs-busy-overlay"),
              menubar: !!document.querySelector(".vs-menubar"),
              bodyLength: (document.body ? document.body.innerHTML.length : 0),
            };
          })()`);
          const errors = consoleLines.filter((l) => /error|uncaught|failed|refused|exception/i.test(l));
          console.log("SMOKE_RESULT " + JSON.stringify({ result, consoleLineCount: consoleLines.length, errors: errors.slice(0, 20) }));
        } catch (err) {
          console.log("SMOKE_RESULT " + JSON.stringify({ evalError: String(err), consoleLines: consoleLines.slice(0, 20) }));
        } finally {
          app.exit(0);
        }
      }, 8000);
    });
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});