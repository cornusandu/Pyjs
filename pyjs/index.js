// pyjs/index.js
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const deasync = require("deasync");

class PyModule {
  constructor(file) {
    this.file = path.resolve(file);
    this.child = null;
    this.ws = null;
    this.funcs = {};
  }

  start() {
    const port = Math.floor(20000 + Math.random() * 10000);
    this.child = spawn("python", ["-u", this.file, "--pyjs-port", port], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child.stderr.on("data", d => {
      console.error("PYERR:", d.toString());
    });

    let done = false;
    let error;
    let delay = 10;

    const tryConnect = () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);

      ws.on("open", () => {
        this.ws = ws;
        // keep asking until funcs arrive
        const askList = () => ws.send(JSON.stringify({ type: "list" }));
        const interval = setInterval(askList, 50);
        askList();

        ws.on("message", msg => {
          const data = JSON.parse(msg);
          if (data.type === "list") {
            clearInterval(interval);
            data.funcs.forEach(fn => {
              this[fn] = (...args) => {
                let finished = false;
                let result;
                const id = Math.random().toString(36).slice(2);

                const listener = reply => {
                  const r = JSON.parse(reply);
                  if (r.type === "result" && r.id === id) {
                    this.ws.off("message", listener);
                    result = r.result;
                    finished = true;
                  }
                };

                this.ws.on("message", listener);
                this.ws.send(JSON.stringify({ type: "call", func: fn, args, id }));

                deasync.loopWhile(() => !finished);
                return result;
              };
            });
            done = true;
          }
        });
      });

    ws.on("error", () => {
      setTimeout(tryConnect, delay);
      delay = Math.min(delay * 2, 200); // exponential backoff
    });
  };

  tryConnect();
  deasync.loopWhile(() => !done && !error);
  if (error) throw error;
}


  stop() {
    if (this.child) this.child.kill();
    if (this.ws) this.ws.close();
  }
}

module.exports = {
  load(file) {
    return new PyModule(file);
  },
};
