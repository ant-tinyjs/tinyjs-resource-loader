var path = require('path');
var fs = require('graceful-fs');
var fse = require('fs-extra');
var yaml = require('yaml-js');
var tempfile = require('tempfile');
var loaderUtils = require('loader-utils');
var Promise = require('bluebird');

var BinPacking = require('./lib/BinPacking');
var FramesPacker = require('./lib/FramesPacker');
var preprocessAsync = require('./lib/preprocessAsync');
var getImageSizeAsync = require('./lib/getImageSizeAsync');
var spritesheetAsync = require('./lib/spritesheetAsync');
var pngOptimizeAsync = require('./lib/pngOptimizeAsync');

var urlLoader = require('url-loader');
var jsonLoader = require('json-loader');

function rewriteJSON (content, imagePathStr) {
  var sheetConfig = JSON.parse(content);
  var imagePath = /"([^"]+)"/.exec(imagePathStr)[1];
  sheetConfig.meta.image = imagePath;
  return JSON.stringify(sheetConfig);
}

function buildFiles (context, query, options = {}, name) {
  var content = '';
  if (query.loader === 'none') {
    return content;
  }
  // build image
  var imageFullPath = path.resolve(query.output, `${name}.png`);
  var imageContent = fs.readFileSync(imageFullPath);
  var imageContext = Object.create(context);
  imageContext.resourcePath = imageFullPath;
  imageContext.query = query.image;
  imageContext.options = options;
  var imagePathStr = urlLoader.call(imageContext, imageContent);
  // build json
  var jsonFullPath = path.resolve(query.output, `${name}.json`);
  var jsonStr = fs.readFileSync(jsonFullPath);
  var jsonContent = rewriteJSON(jsonStr, imagePathStr);
  var jsonContext = Object.create(context);
  jsonContext.resourcePath = jsonFullPath;
  jsonContext.query = query.json;
  jsonContext.options = options;

  if (query.loader === 'json') {
    content = jsonLoader.call(jsonContext, jsonContent);
  } else {
    content = urlLoader.call(jsonContext, jsonContent);
  }

  return content;
}

module.exports = function (content) {
  var self = this;
  var callback = self.async();
  var query = loaderUtils.getOptions(self) || {};
  var config = yaml.load(content.toString()) || {};
  var framesPacker = new FramesPacker(self.context, config);
  var inputTemp = tempfile();
  var outputTemp = tempfile();

  query.process = typeof query.process === 'undefined' ? true : query.process;
  query.output = query.output || inputTemp;

  self.cacheable(true);
  self.addContextDependency(self.context);

  if (config.files) {
    Object.keys(config.files).forEach(function (filePath) {
      var fullPath = path.resolve(self.context, filePath);
      self.addDependency(fullPath);
    });
  }
  // 如果禁用了 process 参数
  if (!query.process) {
    var result = '';
    var imageFullPath = path.resolve(query.output, `${framesPacker.output}.png`);
    if (!fs.existsSync(imageFullPath)) {
      self.emitError(`检测到 process 参数被禁用, 但无法从 output 参数配置的目录中读取 ${framesPacker.output}.json 和 ${framesPacker.output}.png，请确保这些文件在上次构建时已经生成到该目录中。`);
    } else {
      self.emitWarning(`检测到 process 参数被禁用, 不会执行图片合成及处理过程。${framesPacker.output}.json 和 ${framesPacker.output}.png 会直接从 output 参数配置的目录中读取。`);
      result = buildFiles(self, query, self.options, framesPacker.output);
    }

    process.nextTick(function () {
      fse.remove(inputTemp);
      fse.remove(outputTemp);
    });

    return callback(null, result);
  }

  framesPacker.initFrames();
  framesPacker.compressFrames();

  preprocessAsync(framesPacker.frames, framesPacker.config)
    .then(function (compressdFrames) {
      return getImageSizeAsync(compressdFrames, framesPacker.config);
    })
    .then(function (sizedFrames) {
      var binPacking = new BinPacking(framesPacker.output, sizedFrames);
      binPacking.pack();
      var packedFrames = binPacking.packed;
      var canvasSize = {
        width: binPacking.canvasWidth,
        height: binPacking.canvasHeight
      };
      var outputPath = path.join(outputTemp, `${framesPacker.output}`);
      fse.ensureDirSync(outputTemp);
      return spritesheetAsync(packedFrames, canvasSize, outputPath, framesPacker.config);
    })
    .then(function (sourcePath) {
      var destPath = path.resolve(path.join(query.output, framesPacker.output));
      return Promise.all([
        pngOptimizeAsync(`${sourcePath}.png`, `${destPath}.png`, framesPacker.config.colors),
        fse.copy(`${sourcePath}.json`, `${destPath}.json`)
      ]);
    })
    .then(function () {
      var content = buildFiles(self, query, self.options, framesPacker.output);
      process.nextTick(function () {
        fse.remove(inputTemp);
        fse.remove(outputTemp);
      });
      callback(null, content);
    })
    .catch(function (error) {
      if (query.verbose) {
        console.error(error);
      }

      if (query.process) {
        self.emitError(`图片合成或处理过程中发生错误, 系统中很可能没有正确安装 ImageMagick 或 pngquant 依赖。请参考 https://github.com/ant-tinyjs/tinyjs-resource-loader#%E7%B3%BB%E7%BB%9F%E4%BE%9D%E8%B5%96 来解决该问题。`);
      }

      var content = buildFiles(self, query, self.options, framesPacker.output);
      process.nextTick(function () {
        fse.remove(inputTemp);
        fse.remove(outputTemp);
      });
      callback(null, content);
    });
};

module.exports.raw = true;
