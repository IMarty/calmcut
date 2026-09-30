/** Identifiants marqués (branded), pour éviter de confondre un titleId et un segmentId. */
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type TitleId = Brand<string, 'TitleId'>
export type SegmentId = Brand<string, 'SegmentId'>
export type DeviceId = Brand<string, 'DeviceId'>
export type PhobiaId = Brand<string, 'PhobiaId'>

export const asTitleId = (value: string): TitleId => value as TitleId
export const asSegmentId = (value: string): SegmentId => value as SegmentId
export const asDeviceId = (value: string): DeviceId => value as DeviceId
export const asPhobiaId = (value: string): PhobiaId => value as PhobiaId
