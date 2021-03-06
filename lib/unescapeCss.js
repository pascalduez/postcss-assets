const R_ESCAPE = /\\(?:([0-9a-f]{1,6} ?)|(.))/gi;

module.exports = function (str) {
  return str.replace(R_ESCAPE, function (match, hex, char) {
    if (hex) return String.fromCharCode(parseInt(hex, 16));
    return char;
  });
};
