package io.gjessing.luma;

/**
 * Identical to LumaWallpaperService under a second component. Android keeps the running engine
 * when the same component is set again, and a surface that has drawn with Canvas cannot attach
 * a video decoder. Previewing the inactive component makes Android bind a fresh engine.
 */
public class LumaWallpaperServiceAlternate extends LumaWallpaperService {}
