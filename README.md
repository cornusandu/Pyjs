PyJS is a Python/JS library meant to integrate JS and Python. Simply add a `@function` decorator to your Python functions and call them from JavaScript!

```python
from pyjs import function, main

@function
def add(x, y):
	return x + y

if __name__ == "__main__":
	main()
```

```js
// ESM
import {load, start, setup} from "pyjs"

await setup();
const module = load('./add.py');
start(module);

console.log(module.add(2, 3)); // 5
module.stop();
```
