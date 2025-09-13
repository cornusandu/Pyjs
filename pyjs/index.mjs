import { createRequire } from "module";

// create a require function relative to this file
const require = createRequire(import.meta.url);

// pyjs/index.js
const { spawn } = require("child_process");
const WebSocket = require("ws");
const path = require("path");
const deasync = require("deasync");
const fs = require('fs');
const asyncfs = fs.promises

const logfile = "./pyjslog/latest.log";

async function clearLogs(file) {
	await asyncfs.mkdir(path.dirname(file), { recursive: true });
	return await asyncfs.writeFile(file, '');
}

async function writeLog(file, message) {
	return await asyncfs.appendFile(file, `[${new Date().toISOString()}] ${message}`);
}

let _available = false

async function setup() {
	const logfile = "./pyjslog/latest.log";
	await clearLogs(logfile);
	return new Promise((resolve, reject) => {
		writeLog(logfile, 'Started pyjs.\n').catch(err => reject(err))
	.then(v => {
		_available = true;
		resolve(logfile);
	})
	})
}

class PyModule {
	constructor(file) {
		this.file = path.resolve(file);
		this.child = null;
		this.ws = null;
		this.funcs = {};
		this.connected = false;
		this.FAI = false;
	}

	start(proc_port = -1) {
		const logfile = "./pyjslog/latest.log";
		const port = proc_port !== -1 ? proc_port : Math.floor(20000 + Math.random() * 10000);
	
		writeLog(logfile, `Loading ${this.file} on port=${port} (${proc_port == -1 ? 'random' : 'user-chosen'}).\n`)

		this.child = spawn("python", ["-u", this.file, "--pyjs-port", port], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		this.child.stderr.on("data", d => {
			writeLog(logfile, d.toString()).catch(err => console.error(err))
			console.error("PYERR:", d.toString());
		});

		let done = false;
		let error;
		let delay = 50;
		let connected = false;
		let FAI = false; // Functioning as intended

		const tryConnect = () => {
			writeLog(logfile, `Attempting to connect to ws://127.0.0.1:${port}\n| delay = ${delay}\n| file = ${this.file}\n`);
			const ws = new WebSocket(`ws://127.0.0.1:${port}`);

			ws.on("open", () => {
				this.ws = ws;
				// keep asking until funcs arrive
				const askList = () => ws.send(JSON.stringify({ type: "list" }));
				const interval = setInterval(askList, 50);
				askList();

				ws.on("message", msg => {
					if (!this.connected) {
						this.connected = true;
						writeLog(logfile, `WS connection made to ws://127.0.0.1:${port}\n| file = ${this.file}\n`);
					}
					const data = JSON.parse(msg);
					if (data.type === "list") {
						if (!this.FAI) {
							this.FAI = true;
							writeLog(logfile, `Comprehensive WS connection made to ws://127.0.0.1:${port} (CONNECTED).\n| file = ${this.file}\n`)
						}
						clearInterval(interval);
						data.funcs.forEach(fn => {
							this[fn] = (...args) => {
								const id = Math.random().toString(36).slice(2);
								let finished = false;
								let result;
								writeLog(logfile, `Calling ${fn}(${JSON.stringify(args)}) [id=${id}]\n`);

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
			writeLog(logfile, `Failed to connect to ws://127.0.0.1:${port}.\n| file = ${this.file}\n`);
			setTimeout(tryConnect, delay);
			delay = Math.min(delay * 2, 400); // exponential backoff
		});
	};

	tryConnect();
	deasync.loopWhile(() => !done && !error);
	if (error) throw error;
}


	stop() {
		if (this.child) this.child.kill();
		if (this.ws) this.ws.close();
		writeLog(logfile, `Stopped pyjs for ${this.file}\n`);
	}
}

function waitForTrue(getVar, interval = 50) {
  return new Promise(resolve => {
    if (getVar()) {
      resolve(); // resolve immediately if already true
      return;
    }
    const timer = setInterval(() => {
      if (getVar()) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}

export function load(file, port = -1) {
  if (!_available) {
    console.warn("You haven't ran setup() yet. PyModules won't be loaded until you do so. load() will return a Promise that finishes once you call setup() where promise.then() => PyModule.");
    return new Promise(resolve => {
      const timer = setInterval(() => {
        if (_available) {
          clearInterval(timer);
          resolve(new PyModule(file, port));
        }
      }, 3);
    });
  }
  return new PyModule(file, port);
}

export { setup, require };

export async function start(module) {
  if (module instanceof PyModule) {
    module.start();
  } else {
    module.then(m => m.start());
  }
}

