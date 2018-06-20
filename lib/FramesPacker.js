var path = require('path');
var glob = require('glob');

function zeroPad (num, n) {
  return String('00000' + num).slice(-n);
};

function FramePacker (context, config) {
  var self = this;
  var outputName = `tileset-${path.parse(context).name}`;

  self.context = context;
  self.config = Object.assign({}, FramePacker.defaults, config);
  self.output = self.config.interpolate ? self.config.interpolate.replace('$name$', outputName) : outputName;
  self.frames = [];
  self.data = [];
};

FramePacker.prototype = {
  constructor: FramePacker,
  initFrames: function () {
    var self = this;
    var files = [];
    var excludes = [];

    if (self.config.excludes && self.config.excludes.length) {
      excludes = self.config.excludes.map(function (exclude) {
        return path.resolve(self.context, exclude);
      });
    }

    if (self.config.files) {
      files = Object.keys(self.config.files).map(function (file) {
        return path.resolve(self.context, file);
      });
    } else {
      files = glob.sync(path.join(self.context, '*.png'));
    }

    self.frames = files.filter(function (file) {
      var match = ~excludes.indexOf(path.resolve(file));
      return path.extname(file) === '.png' && !match;
    }).map(function (file, index) {
      var resolved = path.resolve(file);
      var name = path.parse(resolved).name;

      return {
        index: index,
        path: resolved,
        name: name,
        extension: path.extname(resolved)
      };
    });
  },

  compressFrames: function () {
    var self = this;
    var reducedFrames = [];

    self.frames.forEach(function (frame, index) {
      var factor = self.config.skip + 1;
      var frameName = path.parse(frame.path).name;

      if (index % factor !== 0) return false;

      var frameIndex;

      if (self.config.files) {
        frameName = `${self.output}-${self.config.files[frame]}`;
      } else {
        frameIndex = zeroPad(parseInt(index / factor + 1, 10), 3);
        frameName = self.config.skip ? `${self.output}-${frameIndex}` : `${self.output}-${frameName}`;
      }

      reducedFrames.push(Object.assign(frame, {
        name: frameName
      }));
    });

    self.frames = reducedFrames;
  }
};

FramePacker.defaults = {
  interpolate: '',
  trim: false,
  rotatable: false,
  scale: 1,
  padding: '10',
  colors: 0,
  skip: 0,
  files: null,
  excludes: []
};

module.exports = FramePacker;
