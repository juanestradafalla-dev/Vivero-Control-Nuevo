export {};

declare global {
  interface Window {
    viveroFoundation?: {
      getRuntimeStatus: () => string;
    };
  }
}
