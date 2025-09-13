# pyjs/__init__.py
import asyncio, websockets, sys, json

_registry = {}

def function(fn):
    _registry[fn.__name__] = fn
    return fn

async def handler(websocket):
    async for message in websocket:
        req = json.loads(message)
        if req["type"] == "list":
            await websocket.send(json.dumps({"type": "list", "funcs": list(_registry.keys())}))
        elif req["type"] == "call":
            fn = _registry.get(req["func"])
            result = None
            if fn:
                result = fn(*req["args"])
            try:
                json.dumps(result)  # ensure JSON serializable
            except:
                result = str(result)
            await websocket.send(json.dumps({"type": "result","id": req["id"],"result": result}))

def serve(port):
    async def main():
        print("PYJS_READY", flush=True)   # 🔑 signal to Node
        async with websockets.serve(handler, "127.0.0.1", port):
            await asyncio.Future()
    asyncio.run(main())

def main():
    if "--pyjs-port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--pyjs-port") + 1])
        serve(port)

if __name__ == "__main__":
    if "--pyjs-port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--pyjs-port") + 1])
        serve(port)
