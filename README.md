# tinyjs-resource-loader

> GitHub: https://github.com/ant-tinyjs/tinyjs-resource-loader

用于处理 tinyjs 中 tileset 游戏资源的 webpack loader

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
{
  test: /\.tileset$/,
  use: [
    {
      loader: 'tinyjs-resource-loader',
      options: {
        process: true,
        output: './output',
        name: '[name]_[hash:6].[ext]',
        limit: false,
        outputPath: 'res'
        // image: {
        //   outputPath: 'res',
        //   publicPath: './'
        // },
        // json: {
        //   outputPath: 'res',
        //   publicPath: './res'
        // }
        // loader: 'json',
      }
    }
  ]
}
```
4. 在模块中引用 `.tileset` 文件
```javascript
import tilesetAnimationJSON from './frames/animation/.tileset';
```

## 处理过程
1. 合成雪碧图：通过 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js) 将 `.tileset` 同目录的图片合成标准 tileset PNG 和 JSON 文件
2. 图片压缩：利用 [node-pngquant](https://github.com/papandreou/node-pngquant) 对合成的 PNG 格式图片按照 `colors` 指定的颜色值进行压缩
3. 将处理得到的 JSON 和图片文件写入 `example/output` 目录（由配置参数 `options.output` 指定）
4. 通过 [url-loader](https://github.com/webpack-contrib/url-loader) 将 `example/output`中的 JSON[可选] 和图片构建到 `dist` 中（由 webpack config 中的 `output.path` 指定）。

```bash
example
├── resources
│   ├── animation # 这里是动画帧存放的目录
│   │   ├── .tileset
│   │   ├── 001.png
│   │   ├── 002.png
│   │   └── 003.png
│   └── index.js
├── output # 图片处理后的 JSON 和图片存放目录
│   ├── tileset-animation.json
│   └── tileset-animation.png
├── dist # 最终产物
│   └── res
│       ├── tileset-animation_[hash].json
│       └── tileset-animation_[hash].png
```

## 系统依赖
在使用 tinyjs-resource-loader 处理 tinyjs 项目中的 JSON 和 png 之前，首先应确保系统中安装了以下工具：
+ [ImageMagick](https://www.imagemagick.org/script/download.php)：提供 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js) 合成雪碧图所需的 `identify` 命令（主要用于获取一个或多个图像文件的格式和特性）
+ [pngquant](https://pngquant.org/)：提供 [node-pngquant](https://github.com/papandreou/node-pngquant) 压缩图片所需的 `pngquant` 命令

> 注：如环境限制不能安装，请看以下的 `options.process` 配置解释

## 配置参数
+ `options.output`: 图片处理后输出 JSON 和图片文件的目录，一般选择源码中的目录，建议提交远程仓库。设置为空时，则不会在源码目录中输出。
+ `options.loader`: 指定 JSON 文件最终产物是文件还是js对象，或者完全不处理，默认为 `url` 可选 `json`
+ `options.process`：是否强制进行图片处理，`false` 时直接从目录中读取先前构建好的文件
+ `options.outputPath`：即 [file-loader](https://github.com/webpack-contrib/file-loader) outputPath 配置
+ `options.publicPath`：即 [file-loader](https://github.com/webpack-contrib/file-loader) outputPath publicPath 配置
+ `options.image`：图片文件的 [url-loader](https://github.com/webpack-contrib/url-loader) 参数
+ `options.json`：JSON 文件的 [url-loader](https://github.com/webpack-contrib/url-loader) 参数。`options.loader` 为 `json` 时无效
+ `options.resource`: 按照配置的模板对 JSON 文件中的 json 和图片路径进行替换。仅在 `options.loader` 为 `json` 时有效
+ `options.verbose`: 是否展示完整错误日志

> `outputPath` 和 `publicPath` 在 `options.image/json` 中配置时，优先级高于 `options` 中的
> `options.process` 设置为 `false` 时，会跳过图片处理过程中的前 4 步，直接从 `options.output` 配置的目录中读取 JSON 和图片，并通过 [url-loader](https://github.com/webpack-contrib/url-loader) 将它们构建到指定目录中，但会产生 **webpack warning**。这是为了确保项目在本地构建过一次以后，在远程机器（很可能没有安装 ImageMagick 或 pngquant 系统依赖）也能够进行构建，兼顾跨平台云构建的需求

## 图片处理参数
+ `trim`：移除图片周围的空白，参照 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js)，默认 `false`
+ `scale`: 图片缩放比例，基于 [imagemagick-stream](https://github.com/eivindfjeldstad/imagemagick-stream) 对图片进行缩放，默认 `1`
+ `padding`: 雪碧图中图片的间隙，参照 [spritesheet.js](https://github.com/krzysztof-o/spritesheet.js)，默认 `10`
+ `skip`：抽帧时跳过的帧数，如果指定为 N，会每跳过 N 帧保留一帧，默认 `0`
+ `colors`：雪碧图进行图片压缩的颜色数，默认 `256`
+ `files`: 以 `[path]-[name]` 对象格式配置的文件路径，如果配置了 `files`，将不会从 `.tileset` 所在目录读取动画帧，而且从 `files` 指定的路径中读取
+ `excludes`: 合成时排除的图片路径
+ `interpolate`: `$name$-fallback` 形式的字符串（可不包含 `$name$`），用于修改名称
+ `rotatable`: 图片合成雪碧图时是否可旋转

`files` 配置的路径为相对于 `.tileset` 所在目录的路径，示例：
```yaml
files:
  ../animation-a/001.png: animation-a
  ../animation-b/001.png: animation-b
  ../animation-c/001.png: animation-c
```
