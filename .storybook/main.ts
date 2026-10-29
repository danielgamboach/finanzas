import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/ds/**/*.mdx', '../src/ds/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  // the logo mark is /icon.svg, same file as the favicon
  staticDirs: ['../public'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
