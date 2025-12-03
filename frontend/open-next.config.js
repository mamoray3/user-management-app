/** @type {import('open-next/types').OpenNextConfig} */
const config = {
  default: {
    override: {
      wrapper: "aws-lambda",
      converter: "aws-lambda-url",
      // Use S3 cache without DynamoDB (simpler setup)
      incrementalCache: "s3",
    },
  },
  // Configure image optimization
  imageOptimization: {
    arch: "x64",
  },
  // Warmer configuration for cold start mitigation
  warmer: {
    invokeFunction: "warmer-function",
  },
  // Build options
  buildCommand: "npx next build",
  appPath: ".",
  buildOutputPath: ".open-next",
  packageJsonPath: "./package.json",
};

module.exports = config;
