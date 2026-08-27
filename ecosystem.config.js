module.exports = {
  apps: [
    {
      name: "receipt-scanner",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3004",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: "3004",
      },
    },
  ],
};
