# tinyjs-resource-loader
用于处理 tinyjs 游戏资源的 webpack loader，旨在让 tinyjs 项目中的动画帧（雪碧图）合成流程更加符合 webpack 工作流

## 安装
`npm install tinyjs-resource-loader -D`

## 使用方法
1. 在动画帧（雪碧图）目录中创建 `.tileset` （或任意名称）配置文件
```bash
animation
├── .tileset
├── 001.png
├── 002.png
└── 003.png
```
2. 参照[图片处理参数](#图片处理参数)以 `yaml` 格式对 `.tileset` 进行配置
```yaml
skip: 1
colors: 16
scale: 0.5
```
3. 在 `webpack.config.js` 中配置 `tinyjs-resource-loader`，该 loader 应作用于上面的配置文件
```javascript
module.export = {
  // statements
  module: {
    loaders: [
      {
        test: /\.tileset/i,
        loader: 'tinyjs-resource-loader',
        query: {
          output: 'game/images',
          image: { // 图片的 url-loader 参数
            name: 'resources/[name].[ext]',
            limit: 4096
          },
          json: { // JSON 的 url-loader 参数
            name: 'resources/[name].[ext]',
            limit: 1
          }
        }
      }
    ]
  },
  output: {
    path: path.resovle('dist')
  }
};
```
4. 在模块中引用 `.tileset` 文件
```javascript
import tilesetAnimationJSON from './frames/animation/.tileset';
// 得到的是 JSON 文件的路径，并且 JSON 中图片的路径会自动根据 resources/[name].[ext] 配置项进行替换
```

## 处理过程
1. 动画抽帧：通过指定 `skip` 配置项来实现每 N 帧抽取一帧的功能
2. 合成雪碧图：通过 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js) 将图片合成雪碧图并生成 tinyjs 所需的 JSON 文件
3. 图片压缩：利用 [node-pngquant](https://github.com/papandreou/node-pngquant) 对合成的 PNG 格式图片按照 `colors` 指定的颜色值进行压缩
4. 将处理得到的 JSON 和图片文件写入 `game/images` 目录（由 `query.output` 指定）
```bash
game
├── frames
│   ├── animation # 这里是动画帧存放的目录
│   │   ├── .tileset
│   │   ├── 001.png
│   │   ├── 002.png
│   │   └── 003.png
├── images # 图片处理后的 JSON 和图片存放目录
│   ├── tileset-animation.json
│   └── tileset-animation.png
└── resources.js
```
5. 最后通过 [url-loader](https://github.com/webpack-contrib/url-loader) 将 `game/images`中的 JSON 和图片构建到 `dist/resources` 中（由 webpack config 中的 `output.path` 指定）。这一步会自动将 JSON 中 `meta.image` 项替换为图片的 `publicPath` 或 `base64` 编码（取决于 `query.image` 的配置）
```bash
dist
└── resources
    ├── tileset-animation.json
    └── tileset-animation.png
```

## 系统依赖
在使用 tinyjs-resource-loader 处理 tinyjs 项目中的 JSON 和 png 之前，首先应确保系统中安装了以下工具：
+ [ImageMagick](https://www.imagemagick.org/script/download.php)：提供 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js) 合成雪碧图所需的 `identify` 命令（主要用于获取一个或多个图像文件的格式和特性）
+ [pngquant](https://pngquant.org/)：提供 [node-pngquant](https://github.com/papandreou/node-pngquant) 压缩图片所需的 `pngquant` 命令
> 注意：如果系统中没有安装以上的依赖，构建时会跳过处理过程中的前 4 步，直接从 `output` 读取 JSON 和图片，并通过 [url-loader](https://github.com/webpack-contrib/url-loader) 将它们构建到指定目录中，但会产生 webpack warning。这是为了确保项目在构建过一次以后，在 windows 环境或者远程机器也能够进行构建，兼顾跨平台或者云构建的需求

## 配置参数
+ `query.output`: 图片处理后输出 JSON 和图片文件的目录，一般选择源码中的目录，建议提交远程仓库
+ `query.image`：图片文件的 [url-loader](https://github.com/webpack-contrib/url-loader) 参数
+ `query.json`：JSON 文件的 [url-loader](https://github.com/webpack-contrib/url-loader) 参数

## 图片处理参数
+ `trim`：移除图片周围的空白，参照 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js)，默认 `false`
+ `scale`: 图片缩放比例，基于 [imagemagick-stream](https://github.com/eivindfjeldstad/imagemagick-stream) 对图片进行缩放，默认 `1`
+ `padding`: 雪碧图中图片的间隙，参照 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js)，默认 `10`
+ `skip`：抽帧时跳过的帧数，如果指定为 N，会每跳过 N 帧保留一帧，默认 `0`
+ `colors`：雪碧图进行图片压缩的颜色数，默认 `256`
+ `files`: 以 `[path]-[name]` 对象格式配置的文件路径，如果配置了 `files`，将不会从 `.tileset` 所在目录读取动画帧，而且从 `files` 指定的路径中读取

`files` 配置的路径为相对于 `.tileset` 所在目录的路径，示例：
```yaml
files:
  ../animation-a/001.png: animation-a
  ../animation-b/001.png: animation-b
  ../animation-c/001.png: animation-c
```
