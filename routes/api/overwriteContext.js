/**
 * Overwrite context with new data.
 * @param {object} context - The original context object
 * @param {object} newData - The new data to merge
 * @returns {object} - The merged context
 */
module.exports = function overwriteContext(context, newData) {
  return { ...context, ...newData };
}; 