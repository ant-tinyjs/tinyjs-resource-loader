var path = require('path');
var fs = require('graceful-fs');
var fse = require('fs-extra');
var yaml = require('yaml-js');
var tempfile = require('tempfile');
var loaderUtils = require('loader-utils');
var Promise = require('bluebird');

var BinPacking = require('./lib/BinPacking');
var FramesPacker = require('./lib/FramesPacker');
var readFromCacheAsync = require('./lib/readFromCacheAsync');
var preprocessAsync = require('./lib/preprocessAsync');
var getImageSizeAsync = require('./lib/getImageSizeAsync');
var spritesheetAsync = require('./lib/spritesheetAsync');
var pngOptimizeAsync = require('./lib/pngOptimizeAsync');

var urlLoader = require('url-loader');

function rewriteJSON (content, imagePathStr, mode, resource) {
  var sheetConfig = JSON.parse(content);
  var imagePath = /"([^"]+)"/.exec(imagePathStr)[1];
  sheetConfig.meta.image = imagePath;

  if (resource) {
    sheetConfig.meta.image = `$$${resource.replace('$url', sheetConfig.meta.image)}$$`;
  }

  if (mode === 'inline') {
    sheetConfig.meta.json = `${path.basename(imagePath, '.png')}.json`;
    if (resource) {
      sheetConfig.meta.json = `$$${resource.replace('$url', sheetConfig.meta.json)}$$`;
    }
  }

  return JSON.stringify(sheetConfig);
}

function buildFiles (context, options, name, callback) {
  var imageOptions = {};

  for (var key in options) {
    if (typeof key !== 'object') imageOptions[key] = options[key];
  }

  // build image
  var imagePathStr;
  var imageFullPath = path.resolve(options.output, `${name}.png`);
  var imageContent = fs.readFileSync(imageFullPath);
  var imageContext = Object.assign({}, context, {
    resourcePath: imageFullPath,
    query: Object.assign({}, imageOptions, options.image)
  });

  imagePathStr = urlLoader.call(imageContext, imageContent);
  afterImage(imagePathStr, function(rs) {
    callback(rs);
  });

  function afterImage(imagePathStr, cb) {
    var content = '';
    // build json
    var jsonFullPath = path.resolve(options.output, `${name}.json`);
    var jsonStr = fs.readFileSync(jsonFullPath);
    var jsonContent = rewriteJSON(jsonStr, imagePathStr, options.mode, options.resource);
    if (options.mode === 'inline') {
      if (options.resource) {
        jsonContent = jsonContent.split('$$').map(segment => segment.replace(/(^")|("$)/g, '')).join('');
      }

      var source = `module.exports = ${jsonContent};`;
      return cb(source);
    } else if (options.mode === 'none') {
      return cb(jsonContent);
    }

    var jsonOptions = {};

    for (var key in options) {
      if (typeof key !== 'object') jsonOptions[key] = options[key];
    }

    var jsonContext = Object.assign({}, context, {
      resourcePath: jsonFullPath,
      query: Object.assign({}, jsonOptions, options.json)
    });

    content = urlLoader.call(jsonContext, jsonContent);
    cb(content);
  }
}

module.exports = function (content) {
  var self = this;
  var callback = self.async();
  var options = loaderUtils.getOptions(self) || {};
  var config = yaml.load(content.toString()) || {};
  var framesPacker = new FramesPacker(self.context, config);
  var inputTemp = tempfile();
  var outputTemp = tempfile();

  function afterProcess(result) {
    process.nextTick(function () {
      fse.remove(inputTemp);
      fse.remove(outputTemp);
    });
    callback(null, result);
  }

  options.process = typeof options.process === 'undefined' ? true : options.process;
  options.output = options.output || inputTemp;
  self.cacheable(true);
  self.addContextDependency(self.context);

  if (config.files) {
    Object.keys(config.files).forEach(function (filePath) {
      var fullPath = path.resolve(self.context, filePath);
      self.addDependency(fullPath);
    });
  }
  // 如果禁用了 process 参数
  if (!options.process) {
    var result = '';
    var imageFullPath = path.resolve(options.output, `${framesPacker.output}.png`);
    if (!fs.existsSync(imageFullPath)) {
      self.emitError(`检测到 process 参数被禁用, 但无法从 output 参数配置的目录中读取 ${framesPacker.output}.json 和 ${framesPacker.output}.png，请确保这些文件在上次构建时已经生成到该目录中。`);
      return afterProcess(result);
    } else {
      self.emitWarning(`检测到 process 参数被禁用, 不会执行图片合成及处理过程。${framesPacker.output}.json 和 ${framesPacker.output}.png 会直接从 output 参数配置的目录中读取。`);
      return buildFiles(self, options, framesPacker.output, afterProcess);
    }
  }

  framesPacker.initFrames();
  framesPacker.compressFrames();

  readFromCacheAsync(options.cacheable, framesPacker.frames, framesPacker.output, options.output)
    .then(function (cached) {
      if (!cached) {
        return preprocessAsync(framesPacker.frames, inputTemp, framesPacker.config)
          .then(function (compressedFrames) {
            return getImageSizeAsync(compressedFrames, framesPacker.config);
          })
          .then(function (sizedFrames) {
            var binPacking = new BinPacking(framesPacker.output, sizedFrames, {
              rotatable: framesPacker.config.rotatable,
              algorithm: 'max-rects'
            });
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
            var destPath = path.resolve(path.join(options.output, framesPacker.output));
            return Promise.all([
              pngOptimizeAsync(`${sourcePath}.png`, `${destPath}.png`, framesPacker.config.colors),
              fse.copy(`${sourcePath}.json`, `${destPath}.json`)
            ]);
          });
      }
    })
    .then(function () {
      buildFiles(self, options, framesPacker.output, afterProcess);
    })
    .catch(function (error) {
      if (options.verbose) {
        console.error(error);
      }

      if (options.process) {
        self.emitError(`图片合成或处理过程中发生错误, 系统中很可能没有正确安装 ImageMagick 或 pngquant 依赖。请参考 https://github.com/ant-tinyjs/tinyjs-resource-loader#%E7%B3%BB%E7%BB%9F%E4%BE%9D%E8%B5%96 来解决该问题。`);
      }

      buildFiles(self, options, framesPacker.output, afterProcess);
    });
};

module.exports.raw = true;
