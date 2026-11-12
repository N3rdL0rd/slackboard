import { getProvider } from "../providers";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, type ComponentRef } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useStore } from "../state/store";
import { Button, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c } from "../theme";


/**
 * The server's reset form is protected by a Google reCAPTCHA, which only runs in a browser, so a native request cannot
 * create a reset. The official app just opens this page; here it is shown inside the app, cut down to the form, with
 * the dark theme applied, and the app notices when the server accepts the request.
 */
const INJECT = `
(function () {
  var style = document.createElement('style');
  style.textContent = [
    'html,body{background:#121618!important;color:#EDEBE4!important;font-family:sans-serif}',
    '.header,.footer,.outro,h1{display:none!important}',
    '.wrapper,.content{padding:0!important;margin:0!important;max-width:none!important;width:auto!important}',
    'h4{font-size:17px;margin:12px 0}',
    'input[type=text]{width:100%;box-sizing:border-box;font-size:17px;padding:14px;border-radius:12px;border:1.5px solid #3A454A;background:#1A2023;color:#EDEBE4}',
    'button{width:100%;font-size:17px;font-weight:700;padding:14px;border-radius:12px;border:0;background:#EDEBE4;color:#121618;margin-top:16px}',
    '.errorMessage{color:#FF8A82!important}',
    '.successMessage p{font-size:17px;line-height:1.4}'
  ].join('');
  document.head.appendChild(style);
  var u = document.getElementById('username');
  var pre = ${'__PREFILL__'};
  if (u && pre) u.value = pre;
  var sent = false;
  setInterval(function () {
    var s = document.getElementById('forgotPasswordFormSuccessMessage');
    if (!sent && s && s.style.display !== 'none') { sent = true; window.ReactNativeWebView.postMessage('sent'); }
  }, 400);
})();
true;`;

export default function ForgotPassword() {
  const router = useRouter();
  const provider = getProvider(useLocalSearchParams<{ provider?: string }>().provider);
  const URL = provider.links.forgotPassword;
  const insets = useSafeAreaInsets();
  const rememberedUser = "";
  const [sent, setSent] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const script = INJECT.replace("__PREFILL__", JSON.stringify(rememberedUser ?? ""));

  const onMessage = (e: WebViewMessageEvent) => { if (e.nativeEvent.data === "sent") setSent(true); };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="screenTitle" style={{ flex: 1 }}>Reset password</Text>
      </View>

      {sent ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Text v="screenTitle">Check your email</Text>
          <Text v="secondary">
            The server has sent reset instructions to the address on your account. If nothing arrives in a few minutes, look in your spam folder for a message from support@auroraclimbing.com.
          </Text>
          <Button label="Back to sign in" onPress={() => router.back()} />
        </View>
      ) : failed ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Text v="secondary" style={{ color: c.danger }} aria-live="polite">Couldn't load the reset form. Check your connection.</Text>
          <Button label="Try again" onPress={() => { setFailed(false); setLoaded(false); web.current?.reload(); }} />
          <Button variant="secondary" label="Open in browser" onPress={() => Linking.openURL(URL)} />
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom }}>
          <Text v="secondary" style={{ marginBottom: 4 }}>
            Enter your username or email. The form below is {provider.name}'s own page, because it has to pass a bot check before it can send the email.
          </Text>
          <WebView ref={web} source={{ uri: URL }} originWhitelist={["https://*"]} injectedJavaScript={script} onMessage={onMessage}
            onLoadEnd={() => setLoaded(true)} onError={() => setFailed(true)} onHttpError={() => setFailed(true)}
            style={{ flex: 1, backgroundColor: c.ground, opacity: loaded ? 1 : 0 }} setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(r) => r.url.startsWith(URL) || r.url.startsWith("https://www.google.com/recaptcha") || r.url.startsWith("https://www.gstatic.com") || r.url.startsWith("about:")} />
        </View>
      )}
    </View>
  );
}
