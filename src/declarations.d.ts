declare module 'jsbarcode/bin/JsBarcode.js' {
  const JsBarcode: {
    getModule: (name: string) => new (data: string, options: Record<string, unknown>) => { encode: () => { data?: string } };
  };
  export default JsBarcode;
}

declare module 'react-native-reanimated' {
  const Animated: any;
  export default Animated;
  export const Easing: any;
  export const FadeIn: any;
  export const FadeInDown: any;
  export function interpolate(value: number, inputRange: number[], outputRange: number[]): number;
  export function useAnimatedStyle(factory: () => Record<string, unknown>): Record<string, unknown>;
  export function useSharedValue<T>(initial: T): { value: T };
  export function withDelay<T>(delayMs: number, value: T): T;
  export function withRepeat<T>(value: T, repeats?: number, reverse?: boolean): T;
  export function withSequence<T>(...values: T[]): T;
  export function withTiming<T>(toValue: T, config?: Record<string, unknown>, callback?: (finished: boolean) => void): T;
  export type SharedValue<T> = { value: T };
}
