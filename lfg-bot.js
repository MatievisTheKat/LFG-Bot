require("./index.js");

module.exports = {
  apps: [
    {
      name: "lfg-bot",
      script: "./index.js",
      watching: ["./index.js"]
    }
  ]
};