import { useRef, useState } from "react";
import { FlatList, Pressable, View, type FlatListProps, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { c } from "../theme";
import { Icon } from "./Icon";

const SHOW_AFTER = 700;

/**
 * A FlatList that shows a "back to top" button once you have scrolled a few screens down. Use it for every
 * long list; it takes the same props as FlatList.
 */
export function JumpList<T>({ fabBottom = 16, onScroll, ...rest }: FlatListProps<T> & { fabBottom?: number }) {
  const ref = useRef<FlatList<T>>(null);
  const [show, setShow] = useState(false);
  const scroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y > SHOW_AFTER;
    setShow((cur) => (cur === past ? cur : past));
    onScroll?.(e);
  };
  return (
    <View style={{ flex: 1 }}>
      <FlatList ref={ref} scrollEventThrottle={64} {...rest} onScroll={scroll} />
      {show && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          onPress={() => ref.current?.scrollToOffset({ offset: 0, animated: true })}
          style={{ position: "absolute", right: 16, bottom: fabBottom, width: 48, height: 48, borderRadius: 24, backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center", elevation: 4 }}
        >
          <Icon name="up" size={22} />
        </Pressable>
      )}
    </View>
  );
}
