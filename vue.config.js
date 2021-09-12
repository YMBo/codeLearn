const path = require("path");
function resolve(dir) {
  return path.join(__dirname, dir);
}
const pageList = ['dev'];
const pages = {};
pageList.map(v => {
  pages[v] = {
    // entry for the page
    entry: `examples/${v}/main.js`,
    // the source template
    template: 'public/index.html',
    // output as dist/index.html
    filename: `${v}.html`,
    // when using title option,
    // template title tag needs to be <title><%= htmlWebpackPlugin.options.title %></title>
    title: `${v} page`,
    // chunks to include on this page, by default includes
    // extracted common chunks and vendor chunks.
  };
});

module.exports = {
  pages,
  // options...
  devServer: {
    disableHostCheck: true
  },
  chainWebpack: config => {
    config.plugin('define').tap(args => {
      let config = {
        "__WEEX__": true,
        "WXEnvironment": true
      }
      args[0] = { ...args[0], ...config }
      return args
    })
    config.resolve.alias
      .set("compiler", resolve("./vue/src/compiler"))
      .set("core", resolve("./vue/src/core"))
      .set("shared", resolve("./vue/src/shared"))
      .set("web", resolve("./vue/src/platforms/web"))
      .set("weex", resolve("./vue/src/platforms/weex"))
      .set("server", resolve("./vue/src/server"))
      .set("entries", resolve("./vue/src/entries"))
      .set("sfc", resolve(".//vue/src/sfc"))
  },
  publicPath:
    process.env.NODE_ENV === 'production' ? '/static/yaya-producer' : ''
};
