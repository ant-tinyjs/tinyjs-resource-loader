var path = require('path');
var fs = require('graceful-fs');
var fse = require('node-fs-extra');
var yaml = require('yaml-js');
var tempfile = require('tempfile');
var loaderUtils = require('loader-utils');
var Promise = require('bluebird');
var exec = require('child_process').exec;
var PngQuant = require('pngquant');
var urlLoader = require('url-loader');
var jsonLoader = require('json-loader');
var im = require('imagemagick-stream');

var spritesheetJS = path.resolve(__dirname, 'node_modules/spritesheet-js/index.js');

function zeroPad (num, n) {
  return String('00000' + num).slice(-n);
};

function copyFile (source, dest, scale) {
  return new Promise(function (resolve) {
    var readStream = fs.createReadStream(source);
    var writeStream = fs.createWriteStream(dest);

    if (scale && scale < 1) {
      var percentage = `${parseInt(scale * 100, 10)}%`;
      var resize = im().resize(percentage);
      readStream.pipe(resize).pipe(writeStream);
    } else {
      readStream.pipe(writeStream);
    }

    writeStream.on('finish', function () {
      resolve();
    });
  });
}

// 抽帧
function trimFrames (name, source, dest, config) {
  var files = [];
  var excludes = [];

  if (config.excludes && config.excludes.length) {
    excludes = config.excludes.map(function (exclude) {
      return path.resolve('/', exclude);
    });
  }

  if (config.files) {
    files = Object.keys(config.files);
  } else {
    files = fs.readdirSync(source);
  }

  fs.mkdirSync(dest);

  files = files.filter(function (file) {
    var match = ~excludes.indexOf(path.resolve('/', file));
    return path.extname(file) === '.png' && !match;
  });

  var promises = [];

  files.forEach(function (file, index) {
    var factor = config.skip + 1;

    if (index % factor !== 0) return false;

    var filePath = path.join(source, file);
    var fileIndex, filename;

    if (config.files) {
      filename = `${name}-${config.files[file]}.png`;
    } else {
      fileIndex = zeroPad(parseInt(index / factor + 1, 10), 3);
      filename = config.skip ? `${name}-${fileIndex}.png` : `${name}-${file}`;
    }

    promises.push(copyFile(filePath, path.join(dest, filename), config.scale));
  });

  return Promise.all(promises);
}

// 合成雪碧图
function spritesheet (name, input, output, config) {
  var args = [
    '-f',
    'json',
    '-p',
    output,
    '-n',
    name,
    '--trim',
    config.trim,
    '--padding',
    config.padding
  ];

  return new Promise(function (resolve, reject) {
    exec(`node ${spritesheetJS} ${args.join(' ')} ${input}`, function (error, stdout, stderr) {
      if (error) return reject(error);

      if (stderr) return reject(stderr);

      var jsonPath = path.join(output, `${name}.json`);
      var oldJSON = fs.readFileSync(jsonPath);
      var newJSON = sortJSONFrames(oldJSON);
      fs.writeFileSync(jsonPath, newJSON, 'utf-8');
      resolve(stdout);
    });
  });
}

// png压缩
function pngOptimize (source, dest, colors) {
  return new Promise(function (resolve, reject) {
    var readStream = fs.createReadStream(source);
    var writeStream = fs.createWriteStream(dest);

    if (colors) {
      var pngquant = new PngQuant([colors]);
      readStream.pipe(pngquant).pipe(writeStream);
    } else {
      readStream.pipe(writeStream);
    }

    readStream.on('error', function (error) {
      reject(error);
    });
    writeStream.on('finish', function () {
      resolve();
    });
  });
}

function sortJSONFrames (content) {
  var json = JSON.parse(content);
  var oldFrames = json.frames;
  var newFrames = {};
  var frameIds = Object.keys(oldFrames).sort();

  frameIds.forEach(function (frameId) {
    newFrames[frameId] = oldFrames[frameId];
  });

  json.frames = newFrames;
  return JSON.stringify(json, null, 2);
}

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
  config = Object.assign({}, defaults, config);

  var parsed = path.parse(self.context);
  var name = `tileset-${parsed.name}`;
  var inputTemp = tempfile();
  var outputTemp = tempfile();

  if (typeof query.process === 'undefined') query.process = true;

  if (!query.output) query.output = inputTemp;

  if (config.interpolate) name = config.interpolate.replace('$name$', name);

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
    var imageFullPath = path.resolve(query.output, `${name}.png`);
    if (!fs.existsSync(imageFullPath)) {
      self.emitError(`检测到 process 参数被禁用, 但无法从 ouput 参数配置的目录中读取 ${name}.json 和 ${name}.png，请确保这些文件在上次构建时已经生成到该目录中。`);
    } else {
      self.emitWarning(`检测到 process 参数被禁用, 不会执行图片合成及处理过程。${name}.json 和 ${name}.png 会直接从 ouput 参数配置的目录中读取。`);
      result = buildFiles(self, query, self.options, name);
    }

    process.nextTick(function () {
      fse.remove(inputTemp);
      fse.remove(outputTemp);
    });

    return callback(null, result);
  }

  trimFrames(name, self.context, inputTemp, config)
    .then(function () {
      var source = path.join(inputTemp, '*.png');
      return spritesheet(name, source, outputTemp, config);
    })
    .then(function () {
      if (!fs.existsSync(query.output)) {
        const err = fs.mkdirSync(query.output, 0o777);
        if (err) {
          throw err;
        }
      }
      var source = path.join(outputTemp, `${name}.png`);
      var dest = path.resolve(query.output, `${name}.png`);
      return pngOptimize(source, dest, config.colors);
    })
    .then(function () {
      var source = path.join(outputTemp, `${name}.json`);
      var dest = path.resolve(query.output, `${name}.json`);

      fse.copy(source, dest, function () {
        setTimeout(function () {
          var content = buildFiles(self, query, self.options, name);
          process.nextTick(function () {
            fse.remove(inputTemp);
            fse.remove(outputTemp);
          });
          callback(null, content);
        }, 500);
      });
    })
    .catch(function (error) {
      if (query.verbose) {
        console.error(error);
      }

      if (query.process) {
        self.emitError(`图片合成或处理过程中发生错误, 系统中很可能没有正确安装 ImageMagick 或 pngquant 依赖。请参考 https://github.com/ant-tinyjs/tinyjs-resource-loader#%E7%B3%BB%E7%BB%9F%E4%BE%9D%E8%B5%96 来解决该问题。`);
      }

      var content = buildFiles(self, query, self.options, name);
      process.nextTick(function () {
        fse.remove(inputTemp);
        fse.remove(outputTemp);
      });
      callback(null, content);
    });
};

module.exports.raw = true;

var defaults = {
  interpolate: '',
  trim: false,
  scale: 1,
  padding: '10',
  colors: 0,
  skip: 0,
  files: null,
  excludes: []
};
