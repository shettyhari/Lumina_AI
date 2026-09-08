import { useState, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";

export type PushState = "unsupported" | "unknown" | "subscribed" | "unsubscribed" | "denied";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const apiPath = (p: string) => `${import.meta.env.BASE_URL}api${p}`.replace(/\/{2,}/g, "/");

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("unknown");
  const [loading, setLoading] = useState(false);

  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    if (typeof Notification !== "undefined" && Notification.permission === "denied") { setState("denied"); return; }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "subscribed" : "unsubscribed");
      } catch {
        setState("unsubscribed");
      }
    })();
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("denied"); return; }

      const reg = await navigator.serviceWorker.register("/sw.js");
      const { publicKey } = await customFetch<{ publicKey: string }>(apiPath("/push/vapid-public-key"));
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON();
      await customFetch(apiPath("/push/subscribe"), {
        method: "POST",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setState("subscribed");
    } catch {
      setState("unsubscribed");
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await customFetch(apiPath("/push/unsubscribe"), {
          method: "POST",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } finally {
      setLoading(false);
    }
  }, []);

  return { state, loading, supported, subscribe, unsubscribe };
}
