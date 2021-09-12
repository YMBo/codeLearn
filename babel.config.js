module.exports = {
  presets: [
    '@vue/cli-plugin-babel/preset'
  ],
  plugins:[
    require('@babel/plugin-proposal-class-properties'),
    require('@babel/plugin-transform-flow-strip-types')
  ]
}
