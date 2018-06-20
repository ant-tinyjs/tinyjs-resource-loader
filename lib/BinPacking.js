var BPC = require('bin-packing-core');

function BinPacking (frames, algorithm, rotatable) {
  const self = this;
  self.algorithm = algorithm;
  self.rotatable = Boolean(rotatable);
  self.canvasWidth = 0;
  self.canvasHeight = 0;
  self.frames = frames;
  self.packed = [];
}

BinPacking.prototype = {
  constructor: BinPacking,
  pack: function () {
    const self = this;
    switch (self.algorithm) {
      case 'max-rects':
      default:
        self.maxRectsPack();
        break;
    }
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

    var bestSize = BPC.genetic(rects, {
      findPosition: 3,
      lifeTimes: 50,
      liveRate: 0.5,
      size: 50,
      allowRotate: self.rotatable
    });

    self.canvasWidth = Math.round(bestSize.x);
    self.canvasHeight = Math.round(bestSize.y);

    var packer = new BPC.MaxRectBinPack(self.canvasWidth, self.canvasHeight, self.rotatable);
    var result = packer.insertRects(rects, 3);

    self.packed = self.frames.map(function (frame) {
      var matched = result.find(function (rect) {
        return rect.info.name === frame.name;
      });

      return Object.assign(frame, {
        x: matched.x,
        y: matched.y
      });
    });
  }
};

module.exports = BinPacking;
