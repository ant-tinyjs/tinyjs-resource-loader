var crypto = require('crypto');
var BPC = require('bin-packing-core');
var cacheMap = {};

function BinPacking (output, frames, algorithm, rotatable) {
  const self = this;
  self.output = output;
  self.algorithm = algorithm;
  self.rotatable = Boolean(rotatable);
  self.canvasWidth = 0;
  self.canvasHeight = 0;
  self.frames = frames;
  self.packed = [];
  self.cacheKey = '';
}

BinPacking.prototype = {
  constructor: BinPacking,
  pack: function () {
    const self = this;
    // pack from cache
    if (self.packFromCache()) return true;

    switch (self.algorithm) {
      case 'max-rects':
      default:
        self.maxRectsPack();
        break;
    }

    process.nextTick(function () {
      self.saveToCache();
    });
  },
  maxRectsPack: function () {
    var self = this;
    var rects = self.frames.map(function (frame) {
      var rect = new BPC.Rect();
      rect.width = frame.width;
      rect.height = frame.height;
      rect.info = {
        name: frame.name
      };
      return rect;
    });

    var totalArea = self.frames.reduce(function (area, frame) {
      return area + frame.area;
    }, 0);

    var minWidth = Math.max.apply(null, self.frames.map(function (frame) {
      return frame.width;
    }));

    var minHeight = Math.max.apply(null, self.frames.map(function (frame) {
      return frame.height;
    }));

    var maxDimension = Math.min(totalArea / minWidth, totalArea / minHeight);
    var aspectRatio = maxDimension > 1500 ? 2 : Infinity;

    var search = new BPC.Search(rects, false, 10, 0, aspectRatio);
    var bestNode = search.search();

    var packer = new BPC.MaxRectBinPack(bestNode.x, bestNode.y, self.rotatable);
    var result = packer.insertRects(rects, BPC.FindPosition.AreaFit);

    var canvasWidth = Math.round(Math.max.apply(null, result.map(function (rect) {
      return rect.x + rect.width;
    })));

    var canvasHeight = Math.round(Math.max.apply(null, result.map(function (rect) {
      return rect.y + rect.height;
    })));

    self.canvasWidth = canvasWidth + (canvasWidth & 1);
    self.canvasHeight = canvasHeight + (canvasHeight & 1);

    self.packed = self.frames.map(function (frame) {
      var matched = result.find(function (rect) {
        return rect.info.name === frame.name;
      }) || {};

      return Object.assign(frame, {
        x: ~~matched.x,
        y: ~~matched.y
      });
    });
  },

  packFromCache: function () {
    var self = this;

    if (cacheMap[self.cacheKey]) {
      var cache = cacheMap[self.cacheKey];
      var result = cache.result;

      self.canvasWidth = cache.width;
      self.canvasHeight = cache.height;
      self.packed = self.frames.map(function (frame) {
        var matched = result.find(function (rect) {
          return rect.info.name === frame.name;
        }) || {};

        return Object.assign(frame, {
          x: ~~matched.x,
          y: ~~matched.y
        });
      });
      return true;
    }

    return false;
  },

  saveToCache: function () {
    var self = this;
    var result = self.packed.map(function (frame) {
      return {
        x: frame.x,
        y: frame.y,
        info: {
          name: frame.name
        }
      };
    });

    self.cacheKey = self.getCacheKey();
    cacheMap[self.cacheKey] = {
      result: result,
      width: self.canvasWidth,
      height: self.canvasHeight
    };
  },

  getCacheKey: function () {
    var self = this;
    var source = self.frames.map(function (frame) {
      return `${frame.name},${frame.width},${frame.height}`;
    }).join('|');

    var hash = crypto.createHash('md5').update(source).digest('hex');
    return `${self.output}-${hash}`;
  }
};

module.exports = BinPacking;
