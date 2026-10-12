import * as React from "../../runtime/react.js";
interface Props extends React.HTMLAttributes<HTMLDivElement> {
    onClickOutside: () => void;
    isOutsideClick?: (event: MouseEvent | TouchEvent) => boolean;
    // If provided, it will use the provided element as the event target
    // instead of document.
    customEventTarget?: HTMLElement | Window | Document;
}

const ClickOutsideContainerImpl: React.FunctionComponent<Props> = p => {
    const { onClickOutside, isOutsideClick, customEventTarget, children, ...rest } = p;
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const propsRef = React.useRef(p);
    propsRef.current = p;

    React.useEffect(() => {
        const clickOutside = (event: Event) => {
            const props = propsRef.current;
            if (props.isOutsideClick && !props.isOutsideClick(event as MouseEvent | TouchEvent)) {
                return;
            }
            if (wrapperRef.current !== null && !wrapperRef.current.contains(event.target as Node | null)) {
                let node = event.target as Element | null;
                while (node !== null) {
                    if (node.classList.contains("click-outside-ignore")) {
                        return;
                    }

                    node = node.parentElement;
                }
                props.onClickOutside();
            }
        };
        const eventTarget = propsRef.current.customEventTarget ?? document;
        eventTarget.addEventListener("pointerdown", clickOutside, true);
        eventTarget.addEventListener("contextmenu", clickOutside, true);
        return () => {
            const target = propsRef.current.customEventTarget ?? document;
            target.removeEventListener("pointerdown", clickOutside, true);
            target.removeEventListener("contextmenu", clickOutside, true);
        };
    }, []);

    return (
        <div {...rest} ref={wrapperRef}>
            {children}
        </div>
    );
};

const ClickOutsideContainer = React.memo(ClickOutsideContainerImpl);
export default ClickOutsideContainer;
