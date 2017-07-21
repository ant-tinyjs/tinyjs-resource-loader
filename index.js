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

var spritesheetJS = path.resolve(__dirname, 'node_modules/spritesheet-js/index.js');

function zeroPad (num, n) {
  return String('00000' + num).slice(-n);
};

function copyFile (source, dest) {
  return new Promise (function (resolve) {
    var readStream = fs.createReadStream(source);
    var writeStream = fs.createWriteStream(dest);
    readStream.pipe(writeStream);
    writeStream.on('finish', function () {
      resolve();
    });
  });
}

// 抽帧
function trimFrames (name, source, dest, skip) {
  var files = fs.readdirSync(source);
  fs.mkdirSync(dest);

  files = files.filter(function (file) {
    return path.extname(file) === '.png';
  });

  var promises = [];

  files.forEach(function (file, index) {
    var factor = skip + 1;

    if (index % factor !== 0) return false;

    var filePath = path.join(source, file);
    var fileIndex = zeroPad(parseInt(index / factor + 1, 10), 3);
    var filename = skip ? `${name}-${fileIndex}.png` : `${name}-${file}`;
    promises.push(copyFile(filePath, path.join(dest, filename)))
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

      if (stderr) return reject(stderror);

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
  return new Promise(function (resolve) {
    var pngquant = new PngQuant([colors]);
    var readStream = fs.createReadStream(source)
    var writeStream = fs.createWriteStream(dest);
    readStream.pipe(pngquant).pipe(writeStream);
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
  var imagePath = /\"([^\"]+)\"/.exec(imagePathStr)[1];
  // 修复file-loader的bug
  imagePath = imagePath.replace('../../antfarm-resource/dist/', '');
  sheetConfig.meta.image = imagePath;
  return JSON.stringify(sheetConfig);
}

function buildFiles (context, query, name) {
  // build image
  var imageFullPath = path.resolve(query.output, `${name}.png`);
  var imageContent = fs.readFileSync(imageFullPath);
  var imageContext = Object.create(context);
  imageContext.resourcePath = imageFullPath;
  imageContext.query = query.image;
  var imagePathStr = urlLoader.call(imageContext, imageContent);
  // build json
  var jsonFullPath = path.resolve(query.output, `${name}.json`);
  var jsonStr = fs.readFileSync(jsonFullPath);
  var jsonContent = rewriteJSON(jsonStr, imagePathStr);
  var jsonContext = Object.create(context);
  jsonContext.resourcePath = jsonFullPath;
  jsonContext.query = query.json;
  var jsonPathStr = urlLoader.call(jsonContext, jsonContent);
  return jsonPathStr;
}

module.exports = function (content) {
  var self = this;
  var callback = self.async();
  var query = loaderUtils.getOptions(self) || {};
  var config = yaml.load(content.toString()) || {};
  config = Object.assign({}, defaults, config);

  var parsed = path.parse(self.context);
  var name = `tileset-${parsed.name}`;

  self.cacheable(true);
  self.addContextDependency(self.context);

  var inputTemp = tempfile();
  var outputTemp = tempfile();

  trimFrames(name, self.context, inputTemp, config.skip)
  .then(function () {
    var source = path.join(inputTemp, '*.png');
    return spritesheet(name, source, outputTemp, config);
  })
  .then(function () {
    var source = path.join(outputTemp, `${name}.png`);
    var dest = path.resolve(query.output, `${name}.png`);
    return pngOptimize(source, dest, config.colors);
  })
  .then(function () {
    var source = path.join(outputTemp, `${name}.json`);
    var dest = path.resolve(query.output, `${name}.json`);

    fse.copy(source, dest, function () {
      fse.remove(inputTemp);
      fse.remove(outputTemp);

      setTimeout(function () {
        var content = buildFiles(self, query, name)
        callback(null, content);
      }, 500);
    });
  })
  .catch(function () {
    var source = path.resolve(query.output, `${name}.json`);
    var jsonStr = fs.readFileSync(source);
    self.emitWarning(`Error occurred in image processing, so ${name}.json and ${name}.png will be directly read from ouput directory. See https://github.com/ant-tinyjs/tinyjs-resource-loader for more info.`);

    fse.remove(inputTemp);
    fse.remove(outputTemp);

    var content = buildFiles(self, query, name)
    callback(null, content);
  })
};

module.exports.raw = true;

var defaults = {
  trim: false,
  padding: '10',
  colors: 256,
  skip: 0
}
