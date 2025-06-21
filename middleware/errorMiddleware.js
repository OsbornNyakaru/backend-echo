// 404 handler
export const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`)
    res.status(404)
    next(error)
  }
  
  // Global error handler
  export const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode
    let message = err.message
  
    // Mongoose bad ObjectId
    if (err.name === "CastError" && err.kind === "ObjectId") {
      statusCode = 404
      message = "Resource not found"
    }
  
    // Duplicate key error
    if (err.code === 11000) {
      statusCode = 400
      message = "Duplicate field value entered"
    }
  
    // Validation error
    if (err.name === "ValidationError") {
      statusCode = 400
      message = Object.values(err.errors)
        .map((val) => val.message)
        .join(", ")
    }
  
    res.status(statusCode).json({
      success: false,
      error: message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
    })
  }
  