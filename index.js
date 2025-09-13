const { load } = require("./pyjs/index")

const myCode = load("./mycode.py")
myCode.start()

const result = myCode.add(1, 2);
console.log(result);

myCode.stop()
