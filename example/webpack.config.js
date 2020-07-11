// const webpack = require('webpack');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

const config = {
  entry: './resources/index.js',
  output: {
    path: path.resolve('./dist/')
  },
  module: {
    rules: [
      {
        test: /\.tileset$/,
        use: [
          {
            loader: path.resolve('../index.js'),
            options: {
              process: true,
              output: './output',
              name: '[name]_[hash:6].[ext]',
              limit: false,
              // mode: 'inline',
              cacheable: true,
              outputPath: 'res',
              publicPath: './'
              // image: {
              //   outputPath: 'res',
              //   publicPath: './'
              // },
              // json: {
              //   outputPath: 'res',
              //   publicPath: './'
              // }
            }
          }
        ]
      }
    ]
  },
  optimization: {
    minimize: false
  }
};

if (isDev) {
  config.devtool = 'eval'; // https://webpack.js.org/configuration/devtool/#devtool
  config.devServer = {
    contentBase: './dist',
    hot: true,
    disableHostCheck: true
  };
}

module.exports = config;
