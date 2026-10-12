import * as React from "../../../runtime/react.js";
import { ImageOverlayEditorStyle } from "./image-overlay-editor-style.js";
import { EditPencil } from "../../../common/utils.js";

/** @category Types */
export interface OverlayImageEditorProps {
    readonly urls: readonly string[];
    readonly canWrite: boolean;
    readonly onCancel: () => void;
    readonly onChange: (newImage: string) => void;
    readonly onEditClick?: () => void;
    readonly renderImage?: (url: string) => React.ReactNode;
}

/**
 * Minimal looping carousel (replaces react-responsive-carousel): arrows, dots, keyboard-free swipe.
 */
const Carousel: React.FunctionComponent<{ readonly allowMove: boolean; readonly children: React.ReactNode[] }> = p => {
    const { allowMove, children } = p;
    const [index, setIndex] = React.useState(0);
    const count = children.length;
    const current = Math.min(index, count - 1);
    const move = React.useCallback((delta: number) => setIndex(i => (i + delta + count) % count), [count]);

    const swipeStart = React.useRef<number | undefined>();
    const onPointerDown = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (allowMove) swipeStart.current = e.clientX;
        },
        [allowMove]
    );
    const onPointerUp = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const start = swipeStart.current;
            swipeStart.current = undefined;
            if (start === undefined) return;
            const dx = e.clientX - start;
            if (Math.abs(dx) > 30) move(dx < 0 ? 1 : -1);
        },
        [move]
    );

    return (
        <div className="carousel-root">
            <div className="carousel carousel-slider" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
                {allowMove && (
                    <button
                        type="button"
                        aria-label="previous slide / item"
                        className="control-arrow control-prev"
                        onClick={() => move(-1)}
                    />
                )}
                <div className="slider-wrapper">
                    <ul className="slider">
                        {children.map((c, i) => (
                            <li key={i} className={i === current ? "slide selected" : "slide"} hidden={i !== current}>
                                {c}
                            </li>
                        ))}
                    </ul>
                </div>
                {allowMove && (
                    <button
                        type="button"
                        aria-label="next slide / item"
                        className="control-arrow control-next"
                        onClick={() => move(1)}
                    />
                )}
                {allowMove && (
                    <ul className="control-dots">
                        {children.map((_, i) => (
                            <li
                                key={i}
                                className={i === current ? "dot selected" : "dot"}
                                role="button"
                                tabIndex={0}
                                aria-label={`slide item ${i + 1}`}
                                onClick={() => setIndex(i)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

/** @category Renderers */
export const ImageOverlayEditor: React.FunctionComponent<OverlayImageEditorProps> = p => {
    const { urls, canWrite, onEditClick, renderImage } = p;

    const filtered = urls.filter(u => u !== "");

    if (filtered.length === 0) {
        return null;
    }

    const allowMove = filtered.length > 1;
    return (
        <ImageOverlayEditorStyle data-testid="GDG-default-image-overlay-editor">
            <Carousel allowMove={allowMove}>
                {filtered.map(url => {
                    const innerContent = renderImage?.(url) ?? <img draggable={false} src={url} />;
                    return (
                        <div className="gdg-centering-container" key={url}>
                            {innerContent}
                        </div>
                    );
                })}
            </Carousel>
            {canWrite && onEditClick && (
                <button className="gdg-edit-icon" onClick={onEditClick}>
                    <EditPencil />
                </button>
            )}
        </ImageOverlayEditorStyle>
    );
};
