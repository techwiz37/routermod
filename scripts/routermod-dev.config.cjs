// pm2 spec for the local dev instance (port 1337).
// Usage: pm2 start scripts/routermod-dev.config.cjs
module.exports = {
  apps: [
    {
      name: "routermod-proxy",
      script: "custom-server.js",
      args: "--port 1337",
      cwd: "C:\\Users\\Administrator\\Desktop\\run-routermod",
      watch: false,
      env: {
        PORT: "1337",
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};
