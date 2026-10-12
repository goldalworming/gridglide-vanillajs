import { styled } from "../../../runtime/styled.js";

export const ImageOverlayEditorStyle = styled.div`
    display: flex;

    height: 100%;

    .gdg-centering-container {
        display: flex;
        justify-content: center;
        align-items: center;

        height: 100%;

        img,
        canvas {
            max-height: calc(100vh - var(--overlay-top) - 20px);
            object-fit: contain;
            user-select: none;
        }

        canvas {
            max-width: 380px;
        }
    }

    .gdg-edit-icon {
        position: absolute;
        top: 12px;
        right: 0;
        width: 48px;
        height: 48px;
        color: var(--gdg-accent-color);

        cursor: pointer;

        display: flex;
        justify-content: center;
        align-items: center;

        > * {
            width: 24px;
            height: 24px;
        }
    }

    .carousel-root {
        flex-grow: 1;
        min-width: 0;
    }

    .carousel {
        position: relative;
        height: 100%;
        user-select: none;
        touch-action: pan-y;
    }

    .slider-wrapper {
        overflow: hidden;
        height: 100%;
    }

    .slider {
        list-style: none;
        margin: 0;
        padding: 0;
        height: 100%;
    }

    .slide {
        height: 100%;
        text-align: center;
    }

    .control-arrow {
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 2;
        width: 32px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        opacity: 0.4;

        :hover {
            opacity: 1;
            background: rgba(0, 0, 0, 0.2);
        }

        ::before {
            content: "";
            display: inline-block;
            border-top: 8px solid transparent;
            border-bottom: 8px solid transparent;
        }
    }

    .control-prev {
        left: 0;

        ::before {
            border-right: 8px solid var(--gdg-text-light);
        }
    }

    .control-next {
        right: 0;

        ::before {
            border-left: 8px solid var(--gdg-text-light);
        }
    }

    .control-dots {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        margin: 10px 0;
        padding: 0;
        text-align: center;
        z-index: 1;

        .dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            margin: 0 8px;
            border-radius: 50%;
            background: var(--gdg-text-light);
            opacity: 0.3;
            cursor: pointer;
        }

        .dot.selected,
        .dot:hover {
            opacity: 1;
        }
    }

    textarea {
        position: absolute;
        top: 0px;
        left: 0px;
        width: 0px;
        height: 0px;

        opacity: 0;
    }
`;
