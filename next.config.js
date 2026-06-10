/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  images: {
    domains: ["lh3.googleusercontent.com", "firebasestorage.googleapis.com"],
  },
  async redirects() {
    return [
      { source: "/lecture-feedback", destination: "/#feedback", permanent: false },
      // You can add more redirects like this:
      // {
      //   source: "/another-form",
      //   destination: "https://forms.gle/...",
      //   permanent: false,
      // },
    ];
  },
};

export default config;
