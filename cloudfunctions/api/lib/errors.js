class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const assert = (condition, code, message) => {
  if (!condition) throw new ApiError(code, message)
}

module.exports = { ApiError, assert }
