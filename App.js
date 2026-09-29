import { isRunningInExpoGo } from "expo";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";

import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from "expo-keep-awake";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { WebView } from "react-native-webview";

import { Ionicons } from "@expo/vector-icons";

/* =========================================================
   WARNA
========================================================= */

const LIGHT = {
  bg: "#F3F6FA",
  card: "#FFFFFF",
  card2: "#F7F9FC",
  text: "#14243A",
  muted: "#708096",
  border: "#E0E7F0",
  primary: "#2563EB",
  primarySoft: "#E8F0FF",
  green: "#16A34A",
  greenSoft: "#E9F8EE",
  orange: "#F59E0B",
  orangeSoft: "#FFF5DD",
  red: "#DC2626",
  redSoft: "#FDECEC",
};

const DARK = {
  bg: "#0A1220",
  card: "#111B2B",
  card2: "#172235",
  text: "#F3F7FF",
  muted: "#9AAAC0",
  border: "#27364D",
  primary: "#4E8CFF",
  primarySoft: "#172D52",
  green: "#35D06F",
  greenSoft: "#113822",
  orange: "#FFB631",
  orangeSoft: "#3A2C0E",
  red: "#FF6565",
  redSoft: "#3B1818",
};

/* =========================================================
   STORAGE KEY
========================================================= */

const STORAGE_KEYS = {
  DAILY_STEPS: "@navacare_daily_steps",
  LAST_WORKOUT: "@navacare_last_workout",
  BMI: "@navacare_bmi",
  DARK_MODE: "@navacare_dark_mode",
  WATER: "@navacare_water",
};

/* =========================================================
   DEFAULT MAP
========================================================= */

const DEFAULT_LOCATION = {
  latitude: -7.4478,
  longitude: 112.7183,
};

/* =========================================================
   HELPER
========================================================= */

const numberOrZero = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const cleanNumber = (value) => {
  return String(value || "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "")
    .replace(/\.(?=.*\.)/g, "");
};

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const haversineMeters = (a, b) => {
  if (!a || !b) return 0;

  const R = 6371000;

  const lat1 =
    (a.latitude * Math.PI) / 180;

  const lat2 =
    (b.latitude * Math.PI) / 180;

  const dLat =
    ((b.latitude - a.latitude) * Math.PI) /
    180;

  const dLon =
    ((b.longitude - a.longitude) * Math.PI) /
    180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(x),
      Math.sqrt(1 - x)
    )
  );
};

const formatDuration = (ms) => {
  const totalSeconds = Math.max(
    0,
    Math.floor(ms / 1000)
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds =
    totalSeconds % 60;

  const mm = String(minutes).padStart(
    2,
    "0"
  );

  const ss = String(seconds).padStart(
    2,
    "0"
  );

  if (hours > 0) {
    return `${String(hours).padStart(
      2,
      "0"
    )}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
};

const formatPace = (
  milliseconds,
  meters
) => {
  if (
    milliseconds <= 0 ||
    meters < 50
  ) {
    return "--:--";
  }

  const secondsPerKm =
    milliseconds / meters;

  if (
    !Number.isFinite(
      secondsPerKm
    )
  ) {
    return "--:--";
  }

  const totalSeconds =
    Math.round(secondsPerKm);

  const minutes = Math.floor(
    totalSeconds / 60
  );

  const seconds =
    totalSeconds % 60;

  return `${minutes}:${String(
    seconds
  ).padStart(2, "0")}`;
};

const calculateCalories = (
  mode,
  weight,
  durationMs,
  speedKmh
) => {
  const weightKg =
    Number(weight);

  if (
    !weightKg ||
    weightKg <= 0 ||
    durationMs <= 0
  ) {
    return 0;
  }

  let met = 3.5;

  if (mode === "jogging") {
    met =
      speedKmh >= 8
        ? 8.3
        : 7;
  }

  if (mode === "jalan") {
    met =
      speedKmh >= 5
        ? 4.3
        : 3.5;
  }

  return Math.round(
    (met *
      3.5 *
      weightKg *
      (durationMs / 60000)) /
      200
  );
};

const formatDistance = (meters) => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  return `${(
    meters / 1000
  ).toFixed(2)} km`;
};

/* =========================================================
   LEAFLET MAP HTML
========================================================= */

const MAP_HTML = `
<!DOCTYPE html>

<html>
<head>

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
/>

<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
/>

<style>

html,
body,
#map {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: #EAF0F7;
}

.leaflet-control-attribution {
  font-size: 9px !important;
}

.user-marker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #2563EB;
  border: 4px solid #FFFFFF;
  box-shadow: 0 2px 10px rgba(0,0,0,.25);
}

.start-marker {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #16A34A;
  border: 3px solid #FFFFFF;
}

</style>

</head>

<body>

<div id="map"></div>

<script
  src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
></script>

<script>

(function () {

  const defaultLocation = [
    ${DEFAULT_LOCATION.latitude},
    ${DEFAULT_LOCATION.longitude}
  ];

  const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true
  }).setView(
    defaultLocation,
    14
  );

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(map);

  const routeLine =
    L.polyline([], {
      color: "#2563EB",
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);

  const userIcon =
    L.divIcon({
      className: "",
      html:
        '<div class="user-marker"></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

  const startIcon =
    L.divIcon({
      className: "",
      html:
        '<div class="start-marker"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

  let userMarker = null;
  let startMarker = null;
  let hasCentered = false;

  function validPoint(point) {

    return (
      point &&
      Number.isFinite(
        Number(point.latitude)
      ) &&
      Number.isFinite(
        Number(point.longitude)
      )
    );

  }

  window.updateNavacareMap =
    function (data) {

      data = data || {};

      const location =
        data.currentLocation;

      const route =
        Array.isArray(data.route)
          ? data.route.filter(
              validPoint
            )
          : [];

      const routeCoords =
        route.map(
          function (point) {
            return [
              Number(point.latitude),
              Number(point.longitude)
            ];
          }
        );

      routeLine.setLatLngs(
        routeCoords
      );

      if (
        validPoint(location)
      ) {

        const currentCoords = [
          Number(location.latitude),
          Number(location.longitude)
        ];

        if (!userMarker) {

          userMarker =
            L.marker(
              currentCoords,
              {
                icon: userIcon,
                title: "Lokasi kamu"
              }
            ).addTo(map);

        } else {

          userMarker.setLatLng(
            currentCoords
          );

        }

        if (
          routeCoords.length > 0
        ) {

          if (!startMarker) {

            startMarker =
              L.marker(
                routeCoords[0],
                {
                  icon: startIcon,
                  title: "Titik awal"
                }
              ).addTo(map);

          } else {

            startMarker.setLatLng(
              routeCoords[0]
            );

          }

        }

        if (!hasCentered) {

          hasCentered = true;

          map.setView(
            currentCoords,
            16
          );

        }

      }

    };

  window.centerNavacareMap =
    function (point) {

      if (
        !validPoint(point)
      ) {

        map.setView(
          defaultLocation,
          14
        );

        return;

      }

      map.setView(
        [
          Number(point.latitude),
          Number(point.longitude)
        ],
        17,
        {
          animate: true
        }
      );

    };

  window.invalidateNavacareMap =
    function () {

      setTimeout(
        function () {
          map.invalidateSize(false);
        },
        100
      );

    };

  setTimeout(
    function () {
      map.invalidateSize(false);
    },
    400
  );

  if (
    window.ReactNativeWebView
  ) {

    window.ReactNativeWebView.postMessage(
      "leaflet-ready"
    );

  }

})();

</script>

</body>
</html>
`;

/* =========================================================
   MAP COMPONENT
========================================================= */

function LeafletMap({
  currentLocation,
  route,
  C,
  height = 320,
  follow = false,
  onLocate,
}) {

  const webViewRef =
    useRef(null);

  const [
    ready,
    setReady
  ] = useState(false);

  const mapData =
    useMemo(
      () =>
        JSON.stringify({
          currentLocation,
          route
        }),
      [
        currentLocation,
        route
      ]
    );

  useEffect(() => {

    if (
      !ready ||
      !webViewRef.current
    ) {
      return;
    }

    webViewRef.current.injectJavaScript(
      `
      window.updateNavacareMap(
        ${mapData}
      );
      true;
      `
    );

    if (
      follow &&
      currentLocation
    ) {

      webViewRef.current.injectJavaScript(
        `
        window.centerNavacareMap(
          ${JSON.stringify(
            currentLocation
          )}
        );
        true;
        `
      );

    }

  }, [
    ready,
    mapData,
    follow,
    currentLocation
  ]);

  const centerMap =
    () => {

      if (
        currentLocation &&
        webViewRef.current
      ) {

        webViewRef.current.injectJavaScript(
          `
          window.centerNavacareMap(
            ${JSON.stringify(
              currentLocation
            )}
          );
          true;
          `
        );

      }

      onLocate?.();

    };

  return (
    <View
      style={[
        styles.mapContainer,
        { height }
      ]}
    >

      <WebView
        ref={webViewRef}
        source={{
          html: MAP_HTML
        }}
        style={styles.map}
        originWhitelist={[
          "*"
        ]}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        startInLoadingState
        onLoadEnd={() => {
          setReady(true);

          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              `
              window.invalidateNavacareMap();
              true;
              `
            );
          }, 150);
        }}
        onMessage={(event) => {

          if (
            event.nativeEvent.data ===
            "leaflet-ready"
          ) {

            setReady(true);

          }

        }}
        renderLoading={() => (
          <View
            style={[
              styles.mapLoading,
              {
                backgroundColor:
                  C.card
              }
            ]}
          >

            <ActivityIndicator
              size="large"
              color={C.primary}
            />

            <Text
              style={[
                styles.mapLoadingText,
                {
                  color:
                    C.muted
                }
              ]}
            >
              Memuat peta...
            </Text>

          </View>
        )}
      />

      <Pressable
        onPress={centerMap}
        style={[
          styles.mapLocateButton,
          {
            backgroundColor:
              C.card
          }
        ]}
      >

        <Ionicons
          name="locate"
          size={21}
          color={C.primary}
        />

      </Pressable>

      <View
        style={[
          styles.mapAttribution,
          {
            backgroundColor:
              C.card
          }
        ]}
      >

        <Text
          style={[
            styles.mapAttributionText,
            {
              color:
                C.muted
            }
          ]}
        >
          © OpenStreetMap
        </Text>

      </View>

    </View>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {

  /* =======================================================
     THEME
  ======================================================= */

  const [
    darkMode,
    setDarkMode
  ] = useState(false);

  const C =
    darkMode
      ? DARK
      : LIGHT;

  /* =======================================================
     SPLASH
  ======================================================= */

  const [
    showSplash,
    setShowSplash
  ] = useState(true);

  const splashOpacity =
    useRef(
      new Animated.Value(1)
    ).current;

  const splashScale =
    useRef(
      new Animated.Value(0.75)
    ).current;

  /* =======================================================
     NAVIGATION
  ======================================================= */

  const [
    activeTab,
    setActiveTab
  ] = useState("home");

  /* =======================================================
     BMI
  ======================================================= */

  const [
    gender,
    setGender
  ] = useState("");

  const [
    age,
    setAge
  ] = useState("");

  const [
    weight,
    setWeight
  ] = useState("");

  const [
    height,
    setHeight
  ] = useState("");

  const [
    bmi,
    setBmi
  ] = useState(null);

  /* =======================================================
     GPS
  ======================================================= */

  const [
    locationPermission,
    setLocationPermission
  ] = useState(false);

  const [
    currentLocation,
    setCurrentLocation
  ] = useState(null);

  const [
    gpsAccuracy,
    setGpsAccuracy
  ] = useState(null);

  const [
    gpsStatus,
    setGpsStatus
  ] = useState(
    "GPS belum digunakan"
  );

  const [
    route,
    setRoute
  ] = useState([]);

  const [
    distance,
    setDistance
  ] = useState(0);

  const distanceRef =
    useRef(0);

  const lastPointRef =
    useRef(null);

  /* =======================================================
     REKAM
  ======================================================= */

  const [
    recordMode,
    setRecordMode
  ] = useState(
    "jogging"
  );

  const [
    recordStatus,
    setRecordStatus
  ] = useState(
    "ready"
  );

  const recordStatusRef =
    useRef("ready");

  const [
    duration,
    setDuration
  ] = useState(0);

  const [
    speed,
    setSpeed
  ] = useState(0);

  const [
    autoFollow,
    setAutoFollow
  ] = useState(true);

  const timerRef =
    useRef(null);

  const startTimeRef =
    useRef(null);

  const elapsedBeforeRef =
    useRef(0);

  const locationSubscriptionRef =
    useRef(null);

  /* =======================================================
     PEDOMETER
  ======================================================= */

  const [
    motionSensorsAvailable,
    setMotionSensorsAvailable
  ] = useState(false);

  const [
    stepPermission,
    setStepPermission
  ] = useState(
    "checking"
  );

  const [
    todaySteps,
    setTodaySteps
  ] = useState(0);

  const [
    sessionSteps,
    setSessionSteps
  ] = useState(0);

  const [
    stepStatus,
    setStepStatus
  ] = useState(
    "Menyiapkan sensor..."
  );

  const accelerometerSubscriptionRef =
    useRef(null);

  const gyroscopeSubscriptionRef =
    useRef(null);

  const gravityMagnitudeRef =
    useRef(1);

  const dynamicAccelerationRef =
    useRef(0);

  const previousDynamicAccelerationRef =
    useRef(0);

  const lastDetectedStepAtRef =
    useRef(0);

  const latestGyroMagnitudeRef =
    useRef(0);

  // Step detector calibration. Accelerometer values are in g;
  // gyroscope values are in rad/s.
  const stepPeakRef = useRef(0);
  const stepValleyRef = useRef(0);
  const stepPeakActiveRef = useRef(false);
  const lastSensorTimestampRef = useRef(0);

  const todayStepsRef =
    useRef(0);

  const activityStartStepsRef =
    useRef(0);

  /* =======================================================
     AKTIVITAS TERAKHIR
  ======================================================= */

  const [
    lastWorkout,
    setLastWorkout
  ] = useState(null);

  /* =======================================================
     NOTIFICATION / WATER
  ======================================================= */

  const [
    waterEnabled,
    setWaterEnabled
  ] = useState(false);

  const [
    waterInterval,
    setWaterInterval
  ] = useState(60);

  const [
    notificationPermission,
    setNotificationPermission
  ] = useState(false);

  const [
    notificationUnavailable,
    setNotificationUnavailable
  ] = useState(false);

  const notificationIdRef =
    useRef(null);

  /* =======================================================
     LOAD STORAGE
  ======================================================= */

  useEffect(() => {

    const loadData =
      async () => {

        try {

          const [
            stepsData,
            workoutData,
            bmiData,
            themeData,
            waterData
          ] =
            await Promise.all([
              AsyncStorage.getItem(
                STORAGE_KEYS.DAILY_STEPS
              ),

              AsyncStorage.getItem(
                STORAGE_KEYS.LAST_WORKOUT
              ),

              AsyncStorage.getItem(
                STORAGE_KEYS.BMI
              ),

              AsyncStorage.getItem(
                STORAGE_KEYS.DARK_MODE
              ),

              AsyncStorage.getItem(
                STORAGE_KEYS.WATER
              )
            ]);

          const today =
            getLocalDateKey();

          if (stepsData) {

            const parsed =
              JSON.parse(
                stepsData
              );

            if (
              parsed.date ===
              today
            ) {

              const savedSteps =
                numberOrZero(
                  parsed.steps
                );

              todayStepsRef.current =
                savedSteps;

              setTodaySteps(
                savedSteps
              );

            }

          }

          if (workoutData) {

            setLastWorkout(
              JSON.parse(
                workoutData
              )
            );

          }

          if (bmiData) {

            const parsed =
              JSON.parse(
                bmiData
              );

            setGender(
              parsed.gender || ""
            );

            setAge(
              parsed.age || ""
            );

            setWeight(
              parsed.weight || ""
            );

            setHeight(
              parsed.height || ""
            );

            setBmi(
              parsed.bmi || null
            );

          }

          if (
            themeData !== null
          ) {

            setDarkMode(
              themeData === "true"
            );

          }

          if (waterData) {

            const parsed =
              JSON.parse(
                waterData
              );

            setWaterEnabled(
              Boolean(
                parsed.enabled
              )
            );

            setWaterInterval(
              numberOrZero(
                parsed.interval
              ) || 60
            );

          }

        } catch (error) {

          console.log(
            "Load storage:",
            error
          );

        }

      };

    loadData();

  }, []);

  /* =======================================================
     SAVE THEME
  ======================================================= */

  useEffect(() => {

    AsyncStorage.setItem(
      STORAGE_KEYS.DARK_MODE,
      String(darkMode)
    ).catch(() => {});

  }, [
    darkMode
  ]);

  /* =======================================================
     SAVE BMI
  ======================================================= */

  useEffect(() => {

    if (!bmi) return;

    AsyncStorage.setItem(
      STORAGE_KEYS.BMI,
      JSON.stringify({
        gender,
        age,
        weight,
        height,
        bmi
      })
    ).catch(() => {});

  }, [
    bmi
  ]);

  /* =======================================================
     SPLASH
  ======================================================= */

  useEffect(() => {

    Animated.parallel([
      Animated.spring(
        splashScale,
        {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true
        }
      ),

      Animated.timing(
        splashOpacity,
        {
          toValue: 0,
          duration: 500,
          delay: 1700,
          easing:
            Easing.out(
              Easing.ease
            ),
          useNativeDriver: true
        }
      )
    ]).start(
      ({
        finished
      }) => {

        if (finished) {

          setShowSplash(
            false
          );

        }

      }
    );

  }, [
    splashOpacity,
    splashScale
  ]);

  /* =======================================================
     CHECK LOCATION
  ======================================================= */

  useEffect(() => {

    const check =
      async () => {

        try {

          const permission =
            await Location.getForegroundPermissionsAsync();

          setLocationPermission(
            Boolean(
              permission.granted
            )
          );

          if (
            permission.granted
          ) {

            setGpsStatus(
              "GPS siap digunakan"
            );

          }

        } catch (error) {

          console.log(
            "Location permission:",
            error
          );

        }

      };

    check();

  }, []);

  /* =======================================================
     NOTIFICATION MODULE
  ======================================================= */

  const getNotifications =
    async () => {

      if (
        isRunningInExpoGo()
      ) {

        setNotificationUnavailable(
          true
        );

        return null;

      }

      try {

        return await import(
          "expo-notifications"
        );

      } catch (error) {

        console.log(
          "Notifications:",
          error
        );

        return null;

      }

    };

  /* =======================================================
     NOTIFICATION SETUP
  ======================================================= */

  useEffect(() => {

    const setup =
      async () => {

        const Notifications =
          await getNotifications();

        if (!Notifications) {
          return;
        }

        try {

          if (
            Platform.OS ===
            "android"
          ) {

            await Notifications.setNotificationChannelAsync(
              "water-reminder",
              {
                name:
                  "Pengingat Minum",
                importance:
                  Notifications
                    .AndroidImportance
                    .HIGH,
                vibrationPattern:
                  [
                    0,
                    250,
                    250,
                    250
                  ],
                sound:
                  "default"
              }
            );

          }

          const permission =
            await Notifications.getPermissionsAsync();

          setNotificationPermission(
            Boolean(
              permission.granted
            )
          );

        } catch (error) {

          console.log(
            "Notification setup:",
            error
          );

        }

      };

    setup();

  }, []);

  /* =======================================================
     MOTION SENSOR — ACCELEROMETER + GYROSCOPE
  ======================================================= */

  const resetMotionDetector = () => {

    gravityMagnitudeRef.current = 1;
    dynamicAccelerationRef.current = 0;
    previousDynamicAccelerationRef.current = 0;
    lastDetectedStepAtRef.current = 0;
    latestGyroMagnitudeRef.current = 0;
    stepPeakRef.current = 0;
    stepValleyRef.current = 0;
    stepPeakActiveRef.current = false;
    lastSensorTimestampRef.current = 0;

  };

  const prepareStepSensors = async (showAlert = true) => {

    try {

      const accelerometerAvailable =
        await Accelerometer.isAvailableAsync();

      const gyroscopeAvailable =
        await Gyroscope.isAvailableAsync();

      const available =
        accelerometerAvailable && gyroscopeAvailable;

      setMotionSensorsAvailable(available);

      if (!available) {

        setStepPermission("unavailable");
        setStepStatus("Accelerometer atau gyroscope tidak tersedia");

        if (showAlert) {
          Alert.alert(
            "Sensor tidak tersedia",
            "HP ini tidak menyediakan accelerometer dan gyroscope yang diperlukan untuk menghitung langkah."
          );
        }

        return false;

      }

      const accelerationPermission =
        await Accelerometer.getPermissionsAsync();

      const gyroPermission =
        await Gyroscope.getPermissionsAsync();

      let accelerationGranted =
        accelerationPermission.granted;

      let gyroGranted =
        gyroPermission.granted;

      if (!accelerationGranted) {
        const requested =
          await Accelerometer.requestPermissionsAsync();
        accelerationGranted = requested.granted;
      }

      if (!gyroGranted) {
        const requested =
          await Gyroscope.requestPermissionsAsync();
        gyroGranted = requested.granted;
      }

      if (!accelerationGranted || !gyroGranted) {

        setStepPermission("denied");
        setStepStatus("Izin sensor gerak belum diberikan");

        if (showAlert) {

          Alert.alert(
            "Izin sensor gerak",
            "Izinkan akses sensor gerak agar Navacare dapat menghitung langkah. Jika izin sudah ditolak permanen, buka Pengaturan aplikasi.",
            [
              { text: "Batal", style: "cancel" },
              {
                text: "Buka Pengaturan",
                onPress: () => Linking.openSettings()
              }
            ]
          );

        }

        return false;

      }

      setStepPermission("granted");
      setStepStatus("Accelerometer + gyroscope aktif");

      return true;

    } catch (error) {

      console.log("Prepare motion sensors:", error);

      setStepPermission("error");
      setStepStatus("Sensor gerak gagal disiapkan");

      if (showAlert) {
        Alert.alert(
          "Sensor gerak",
          "Accelerometer dan gyroscope belum dapat digunakan pada perangkat ini."
        );
      }

      return false;

    }

  };

  /* =======================================================
     SAVE TODAY STEPS
  ======================================================= */

  const saveTodaySteps = async (steps) => {

    const today = getLocalDateKey();

    try {

      await AsyncStorage.setItem(
        STORAGE_KEYS.DAILY_STEPS,
        JSON.stringify({
          date: today,
          steps
        })
      );

    } catch (error) {
      console.log("Save steps:", error);
    }

  };

  /* =======================================================
     COUNT STEP FROM ACCELEROMETER + GYROSCOPE
  ======================================================= */

  const registerDetectedStep = () => {

    const now = Date.now();

    // A normal walking cadence is roughly 0.4–1.2 s per step.
    // 280 ms is only a safety lock against duplicate peaks.
    if (now - lastDetectedStepAtRef.current < 280) {
      return;
    }

    lastDetectedStepAtRef.current = now;

    const next = todayStepsRef.current + 1;

    todayStepsRef.current = next;
    setTodaySteps(next);
    saveTodaySteps(next);

    if (recordStatusRef.current === "tracking") {
      setSessionSteps(
        Math.max(
          0,
          next - activityStartStepsRef.current
        )
      );
    }

  };

  const startStepSensorWatcher = async () => {

    const ok = await prepareStepSensors(false);

    if (!ok) {
      return false;
    }

    accelerometerSubscriptionRef.current?.remove?.();
    gyroscopeSubscriptionRef.current?.remove?.();

    resetMotionDetector();

    // 50 ms = 20 Hz. This gives the peak detector enough samples
    // without unnecessarily increasing battery consumption.
    Accelerometer.setUpdateInterval(50);
    Gyroscope.setUpdateInterval(50);

    gyroscopeSubscriptionRef.current =
      Gyroscope.addListener(({ x = 0, y = 0, z = 0 }) => {

        const magnitude = Math.sqrt(
          x * x +
          y * y +
          z * z
        );

        if (Number.isFinite(magnitude)) {
          // Smooth gyro noise before using it as a confidence signal.
          latestGyroMagnitudeRef.current =
            latestGyroMagnitudeRef.current * 0.65 +
            magnitude * 0.35;
        }

      });

    accelerometerSubscriptionRef.current =
      Accelerometer.addListener(({ x = 0, y = 0, z = 0, timestamp }) => {

        const magnitude = Math.sqrt(
          x * x +
          y * y +
          z * z
        );

        if (!Number.isFinite(magnitude)) {
          return;
        }

        // Accelerometer is expressed in g. A slow low-pass estimate
        // tracks gravity while preserving the faster walking signal.
        const gravity =
          gravityMagnitudeRef.current * 0.92 +
          magnitude * 0.08;

        gravityMagnitudeRef.current = gravity;

        const dynamic = Math.abs(magnitude - gravity);

        // Light smoothing removes hand/phone vibration while retaining
        // the main walking pulse.
        const smoothed =
          dynamicAccelerationRef.current * 0.72 +
          dynamic * 0.28;

        const previous =
          previousDynamicAccelerationRef.current;

        dynamicAccelerationRef.current = smoothed;
        previousDynamicAccelerationRef.current = smoothed;

        // Fixed + adaptive threshold: normal steps need about 0.18 g,
        // while a slowly moving phone can still trigger above its local noise floor.
        const noiseFloor = Math.min(0.14, Math.max(0.025, gravityMagnitudeRef.current * 0.025));
        const PEAK_THRESHOLD = Math.max(0.18, noiseFloor + 0.12);
        const VALLEY_THRESHOLD = 0.075;

        // Detect a local peak, then count it only after the signal starts
        // falling. This is more reliable than counting every threshold crossing.
        if (!stepPeakActiveRef.current) {
          if (smoothed >= PEAK_THRESHOLD && smoothed >= previous) {
            stepPeakActiveRef.current = true;
            stepPeakRef.current = smoothed;
            stepValleyRef.current = previous;
          }
        } else {
          stepPeakRef.current = Math.max(
            stepPeakRef.current,
            smoothed
          );

          stepValleyRef.current = Math.min(
            stepValleyRef.current,
            smoothed
          );

          const descending = smoothed < previous;
          const sufficientDrop =
            stepPeakRef.current - smoothed >= 0.055;
          const gyroMagnitude =
            latestGyroMagnitudeRef.current;

          // Gyro is a confidence filter, not a second step counter.
          // Very large rotation is usually phone handling/shaking.
          const rotationIsReasonable = gyroMagnitude < 5.5;
          const strongAcceleration = stepPeakRef.current >= 0.42;
          const gyroSupportsMovement =
            gyroMagnitude >= 0.08 && gyroMagnitude < 5.5;

          if (
            descending &&
            sufficientDrop &&
            smoothed <= VALLEY_THRESHOLD &&
            (rotationIsReasonable || strongAcceleration) &&
            (gyroSupportsMovement || strongAcceleration)
          ) {
            registerDetectedStep();
            stepPeakActiveRef.current = false;
            stepPeakRef.current = 0;
            stepValleyRef.current = 0;
          }

          // If the peak has decayed without forming a complete step,
          // reset so a new movement can be evaluated independently.
          if (
            stepPeakActiveRef.current &&
            smoothed < 0.045 &&
            stepPeakRef.current < 0.18
          ) {
            stepPeakActiveRef.current = false;
            stepPeakRef.current = 0;
            stepValleyRef.current = 0;
          }
        }

        lastSensorTimestampRef.current = timestamp || 0;

      });

    setStepStatus("Accelerometer + gyroscope aktif");

    return true;

  };

  /* =======================================================
     MOTION SENSOR STARTUP
  ======================================================= */

  useEffect(() => {

    let mounted = true;

    const setup = async () => {

      const available =
        (await Accelerometer.isAvailableAsync()) &&
        (await Gyroscope.isAvailableAsync());

      if (!mounted) {
        return;
      }

      setMotionSensorsAvailable(available);

      if (!available) {

        setStepPermission("unavailable");
        setStepStatus("Accelerometer atau gyroscope tidak tersedia");
        return;

      }

      const accelerationPermission =
        await Accelerometer.getPermissionsAsync();

      const gyroPermission =
        await Gyroscope.getPermissionsAsync();

      if (!mounted) {
        return;
      }

      const granted =
        accelerationPermission.granted &&
        gyroPermission.granted;

      setStepPermission(
        granted ? "granted" : "denied"
      );

      if (granted) {
        setStepStatus("Accelerometer + gyroscope aktif");
        await startStepSensorWatcher();
      } else {
        setStepStatus("Tekan Aktifkan Sensor untuk memulai");
      }

    };

    setup();

    return () => {

      mounted = false;

      accelerometerSubscriptionRef.current?.remove?.();
      gyroscopeSubscriptionRef.current?.remove?.();

      accelerometerSubscriptionRef.current = null;
      gyroscopeSubscriptionRef.current = null;

    };

  }, []);

  /* =======================================================
     RESTART SENSOR SAAT APP KEMBALI AKTIF
  ======================================================= */

  useEffect(() => {

    const subscription =
      AppState.addEventListener(
        "change",
        async (nextState) => {

          if (
            nextState === "active" &&
            stepPermission === "granted"
          ) {
            await startStepSensorWatcher();
          }

        }
      );

    return () => subscription.remove();

  }, [stepPermission]);

  /* =======================================================
     AKTIFKAN SENSOR DARI PROFILE
  ======================================================= */

  const enableStepSensor = async () => {

    const ok = await prepareStepSensors(true);

    if (!ok) {
      return;
    }

    await startStepSensorWatcher();

    Alert.alert(
      "Sensor aktif",
      "Navacare sekarang menghitung langkah menggunakan accelerometer dan gyroscope HP."
    );

  };

  /* =======================================================
     REQUEST LOCATION
  ======================================================= */

  const requestLocation =
    async () => {

      try {

        const permission =
          await Location.requestForegroundPermissionsAsync();

        if (
          !permission.granted
        ) {

          setLocationPermission(
            false
          );

          setGpsStatus(
            "Izin lokasi ditolak"
          );

          Alert.alert(
            "Izin lokasi diperlukan",
            "Izinkan lokasi agar Navacare dapat membaca posisi dan merekam rute.",
            [
              {
                text:
                  "Tutup",
                style:
                  "cancel"
              },

              ...(permission.canAskAgain ===
              false
                ? [
                    {
                      text:
                        "Pengaturan",
                      onPress:
                        () =>
                          Linking.openSettings()
                    }
                  ]
                : [])
            ]
          );

          return false;

        }

        setLocationPermission(
          true
        );

        const gpsEnabled =
          await Location.hasServicesEnabledAsync();

        if (!gpsEnabled) {

          setGpsStatus(
            "GPS perangkat mati"
          );

          Alert.alert(
            "GPS belum aktif",
            "Aktifkan Lokasi/GPS pada HP kamu terlebih dahulu."
          );

          return false;

        }

        return true;

      } catch (error) {

        console.log(
          "Request location:",
          error
        );

        return false;

      }

    };

  /* =======================================================
     HANDLE LOCATION
  ======================================================= */

  const handleLocation =
    (location) => {

      const coords =
        location?.coords;

      if (
        !coords ||
        !Number.isFinite(
          coords.latitude
        ) ||
        !Number.isFinite(
          coords.longitude
        )
      ) {

        return;

      }

      const point = {
        latitude:
          coords.latitude,
        longitude:
          coords.longitude
      };

      const accuracy =
        numberOrZero(
          coords.accuracy
        ) || 999;

      setCurrentLocation(
        point
      );

      setGpsAccuracy(
        accuracy
      );

      if (
        accuracy > 60
      ) {

        setGpsStatus(
          `GPS kurang akurat ±${Math.round(
            accuracy
          )} m`
        );

      } else {

        setGpsStatus(
          `GPS aktif ±${Math.round(
            accuracy
          )} m`
        );

      }

      if (
        recordStatusRef.current !==
        "tracking"
      ) {

        return;

      }

      const last =
        lastPointRef.current;

      if (last) {

        const moved =
          haversineMeters(
            last,
            point
          );

        /*
          Abaikan gerakan terlalu kecil
          dan lonjakan GPS yang tidak realistis.
        */

        if (
          moved < 3 ||
          moved > 100
        ) {

          return;

        }

        distanceRef.current +=
          moved;

        setDistance(
          distanceRef.current
        );

      }

      lastPointRef.current =
        point;

      setRoute(
        (previous) => [
          ...previous,
          point
        ]
      );

      if (
        Number.isFinite(
          coords.speed
        ) &&
        coords.speed >= 0
      ) {

        setSpeed(
          coords.speed * 3.6
        );

      }

    };

  /* =======================================================
     STOP GPS WATCHER
  ======================================================= */

  const stopLocationWatcher =
    () => {

      locationSubscriptionRef.current?.remove?.();

      locationSubscriptionRef.current =
        null;

    };

  /* =======================================================
     START GPS WATCHER
  ======================================================= */

  const startLocationWatcher =
    async () => {

      try {

        const current =
          await Location.getCurrentPositionAsync(
            {
              accuracy:
                Location.Accuracy.Highest
            }
          );

        handleLocation(
          current
        );

        locationSubscriptionRef.current =
          await Location.watchPositionAsync(
            {
              accuracy:
                Location.Accuracy.High,

              distanceInterval: 3,

              timeInterval: 3000,

              mayShowUserSettingsDialog:
                true
            },
            handleLocation
          );

      } catch (error) {

        console.log(
          "Start GPS:",
          error
        );

        setGpsStatus(
          "GPS gagal membaca lokasi"
        );

        Alert.alert(
          "GPS bermasalah",
          "Lokasi belum berhasil dibaca. Pastikan GPS aktif."
        );

      }

    };

  /* =======================================================
     TIMER
  ======================================================= */

  useEffect(() => {

    if (
      recordStatus !==
      "tracking"
    ) {

      if (
        timerRef.current
      ) {

        clearInterval(
          timerRef.current
        );

        timerRef.current =
          null;

      }

      return;

    }

    timerRef.current =
      setInterval(
        () => {

          if (
            !startTimeRef.current
          ) {

            return;

          }

          const elapsed =
            elapsedBeforeRef.current +
            (
              Date.now() -
              startTimeRef.current
            );

          setDuration(
            elapsed
          );

        },
        250
      );

    return () => {

      if (
        timerRef.current
      ) {

        clearInterval(
          timerRef.current
        );

      }

      timerRef.current =
        null;

    };

  }, [
    recordStatus
  ]);

  /* =======================================================
     START ACTIVITY
  ======================================================= */

  const startActivity =
    async () => {

      const locationOk =
        await requestLocation();

      if (!locationOk) {
        return;
      }

      const sensorOk =
        await prepareStepSensors(
          true
        );

      if (
        !sensorOk
      ) {

        Alert.alert(
          "Sensor langkah belum aktif",
          "Aktivitas tetap bisa memakai GPS, tetapi jumlah langkah tidak dapat dihitung sampai sensor diaktifkan."
        );

      } else {

        await startStepSensorWatcher();

      }

      stopLocationWatcher();

      distanceRef.current =
        0;

      lastPointRef.current =
        null;

      setDistance(
        0
      );

      setSpeed(
        0
      );

      setRoute(
        []
      );

      setDuration(
        0
      );

      setSessionSteps(
        0
      );

      activityStartStepsRef.current =
        todayStepsRef.current;

      elapsedBeforeRef.current =
        0;

      startTimeRef.current =
        Date.now();

      recordStatusRef.current =
        "tracking";

      setRecordStatus(
        "tracking"
      );

      try {

        await activateKeepAwakeAsync(
          "navacare-activity"
        );

      } catch {}

      await startLocationWatcher();

    };

  /* =======================================================
     PAUSE
  ======================================================= */

  const pauseActivity =
    async () => {

      if (
        recordStatusRef.current !==
        "tracking"
      ) {

        return;
      }

      if (
        startTimeRef.current
      ) {

        elapsedBeforeRef.current +=
          Date.now() -
          startTimeRef.current;

      }

      startTimeRef.current =
        null;

      setDuration(
        elapsedBeforeRef.current
      );

      stopLocationWatcher();

      recordStatusRef.current =
        "paused";

      setRecordStatus(
        "paused"
      );

      try {

        await deactivateKeepAwake(
          "navacare-activity"
        );

      } catch {}

    };

  /* =======================================================
     RESUME
  ======================================================= */

  const resumeActivity =
    async () => {

      if (
        recordStatusRef.current !==
        "paused"
      ) {

        return;
      }

      const ok =
        await requestLocation();

      if (!ok) {
        return;
      }

      startTimeRef.current =
        Date.now();

      recordStatusRef.current =
        "tracking";

      setRecordStatus(
        "tracking"
      );

      try {

        await activateKeepAwakeAsync(
          "navacare-activity"
        );

      } catch {}

      await startLocationWatcher();

    };

  /* =======================================================
     STOP
  ======================================================= */

  const stopActivity =
    async () => {

      if (
        recordStatusRef.current !==
          "tracking" &&
        recordStatusRef.current !==
          "paused"
      ) {

        return;

      }

      if (
        recordStatusRef.current ===
          "tracking" &&
        startTimeRef.current
      ) {

        elapsedBeforeRef.current +=
          Date.now() -
          startTimeRef.current;

      }

      startTimeRef.current =
        null;

      stopLocationWatcher();

      const finalDuration =
        elapsedBeforeRef.current;

      const finalSteps =
        Math.max(
          0,
          todayStepsRef.current -
            activityStartStepsRef.current
        );

      const finalCalories =
        calculateCalories(
          recordMode,
          Number(weight) || 60,
          finalDuration,
          speed
        );

      const workout = {
        mode:
          recordMode,

        distance:
          distanceRef.current,

        duration:
          finalDuration,

        steps:
          finalSteps,

        calories:
          finalCalories,

        speed:
          speed,

        date:
          new Date().toLocaleString(
            "id-ID",
            {
              day:
                "2-digit",
              month:
                "short",
              year:
                "numeric",
              hour:
                "2-digit",
              minute:
                "2-digit"
            }
          )
      };

      setLastWorkout(
        workout
      );

      try {

        await AsyncStorage.setItem(
          STORAGE_KEYS.LAST_WORKOUT,
          JSON.stringify(
            workout
          )
        );

      } catch (error) {

        console.log(
          "Save workout:",
          error
        );

      }

      setSessionSteps(
        finalSteps
      );

      recordStatusRef.current =
        "ready";

      setRecordStatus(
        "ready"
      );

      try {

        await deactivateKeepAwake(
          "navacare-activity"
        );

      } catch {}

      Alert.alert(
        "Aktivitas selesai",
        `${recordMode === "jogging" ? "Jogging" : "Jalan"} selesai dengan jarak ${formatDistance(
          distanceRef.current
        )}.`
      );

    };

  /* =======================================================
     RESET RECORD
  ======================================================= */

  const resetActivity =
    async () => {

      stopLocationWatcher();

      if (
        timerRef.current
      ) {

        clearInterval(
          timerRef.current
        );

        timerRef.current =
          null;

      }

      startTimeRef.current =
        null;

      elapsedBeforeRef.current =
        0;

      distanceRef.current =
        0;

      lastPointRef.current =
        null;

      activityStartStepsRef.current =
        todayStepsRef.current;

      setDistance(
        0
      );

      setDuration(
        0
      );

      setSpeed(
        0
      );

      setRoute(
        []
      );

      setSessionSteps(
        0
      );

      recordStatusRef.current =
        "ready";

      setRecordStatus(
        "ready"
      );

      try {

        await deactivateKeepAwake(
          "navacare-activity"
        );

      } catch {}

    };

  /* =======================================================
     BMI
  ======================================================= */

  const calculateBMI =
    () => {

      const w =
        Number(
          String(weight).replace(
            ",",
            "."
          )
        );

      const h =
        Number(
          String(height).replace(
            ",",
            "."
          )
        ) / 100;

      if (
        !w ||
        !h ||
        w <= 0 ||
        h <= 0
      ) {

        Alert.alert(
          "Data belum lengkap",
          "Masukkan berat dan tinggi badan terlebih dahulu."
        );

        return;

      }

      const result =
        Number(
          (
            w /
            (h * h)
          ).toFixed(1)
        );

      setBmi(
        result
      );

    };

  const bmiInfo =
    useMemo(() => {

      if (!bmi) {
        return null;
      }

      let category =
        "Normal";

      let icon =
        "checkmark-circle";

      let color =
        C.green;

      if (
        bmi < 18.5
      ) {

        category =
          "Kurus";

        icon =
          "arrow-down-circle";

        color =
          C.orange;

      } else if (
        bmi < 25
      ) {

        category =
          "Normal";

      } else if (
        bmi < 30
      ) {

        category =
          "Gemuk";

        icon =
          "warning";

        color =
          C.orange;

      } else {

        category =
          "Obesitas";

        icon =
          "alert-circle";

        color =
          C.red;

      }

      const h =
        Number(
          String(height).replace(
            ",",
            "."
          )
        ) / 100;

      const minWeight =
        18.5 *
        h *
        h;

      const maxWeight =
        24.9 *
        h *
        h;

      return {
        category,
        icon,
        color,
        minWeight:
          minWeight.toFixed(1),
        maxWeight:
          maxWeight.toFixed(1)
      };

    }, [
      bmi,
      height,
      C
    ]);

  /* =======================================================
     WATER REMINDER SAVE
  ======================================================= */

  const saveWaterSettings =
    async (
      enabled = waterEnabled,
      interval = waterInterval
    ) => {

      try {

        await AsyncStorage.setItem(
          STORAGE_KEYS.WATER,
          JSON.stringify({
            enabled,
            interval
          })
        );

      } catch {}

    };

  /* =======================================================
     SCHEDULE WATER
  ======================================================= */

  const scheduleWater =
    async (
      minutes
    ) => {

      const Notifications =
        await getNotifications();

      if (!Notifications) {

        Alert.alert(
          "Expo Go",
          "Pengingat notifikasi lokal membutuhkan development build Android. Pengaturan interval tetap tersimpan."
        );

        return false;

      }

      try {

        let permission =
          await Notifications.getPermissionsAsync();

        if (
          !permission.granted
        ) {

          permission =
            await Notifications.requestPermissionsAsync();

        }

        if (
          !permission.granted
        ) {

          setNotificationPermission(
            false
          );

          Alert.alert(
            "Izin notifikasi diperlukan",
            "Aktifkan izin notifikasi terlebih dahulu."
          );

          return false;

        }

        setNotificationPermission(
          true
        );

        if (
          notificationIdRef.current
        ) {

          await Notifications.cancelScheduledNotificationAsync(
            notificationIdRef.current
          );

        }

        notificationIdRef.current =
          await Notifications.scheduleNotificationAsync(
            {
              content: {
                title:
                  "💧 Waktunya minum",
                body:
                  "Jangan lupa minum air dan jaga hidrasi tubuhmu.",
                sound:
                  "default"
              },

              trigger: {
                type:
                  Notifications
                    .SchedulableTriggerInputTypes
                    .TIME_INTERVAL,

                seconds:
                  Math.max(
                    60,
                    Number(minutes) *
                      60
                  ),

                repeats:
                  true,

                ...(Platform.OS ===
                "android"
                  ? {
                      channelId:
                        "water-reminder"
                    }
                  : {})
              }
            }
          );

        return true;

      } catch (error) {

        console.log(
          "Schedule water:",
          error
        );

        return false;

      }

    };

  /* =======================================================
     TOGGLE WATER
  ======================================================= */

  const toggleWater =
    async () => {

      if (
        waterEnabled
      ) {

        const Notifications =
          await getNotifications();

        try {

          if (
            Notifications &&
            notificationIdRef.current
          ) {

            await Notifications.cancelScheduledNotificationAsync(
              notificationIdRef.current
            );

          }

        } catch {}

        notificationIdRef.current =
          null;

        setWaterEnabled(
          false
        );

        await saveWaterSettings(
          false,
          waterInterval
        );

        return;

      }

      const success =
        await scheduleWater(
          waterInterval
        );

      /*
        Pengaturan tetap dinyalakan secara visual
        hanya bila notifikasi benar-benar berhasil.
      */

      if (success) {

        setWaterEnabled(
          true
        );

        await saveWaterSettings(
          true,
          waterInterval
        );

      }

    };

  /* =======================================================
     CHANGE WATER INTERVAL
  ======================================================= */

  const changeWaterInterval =
    async (
      value
    ) => {

      setWaterInterval(
        value
      );

      await saveWaterSettings(
        waterEnabled,
        value
      );

      if (
        waterEnabled
      ) {

        await scheduleWater(
          value
        );

      }

    };

  /* =======================================================
     TEST NOTIFICATION
  ======================================================= */

  const testNotification =
    async () => {

      const Notifications =
        await getNotifications();

      if (!Notifications) {

        Alert.alert(
          "Expo Go",
          "Tes notifikasi lokal tidak tersedia di Expo Go. Gunakan development build."
        );

        return;

      }

      try {

        let permission =
          await Notifications.getPermissionsAsync();

        if (
          !permission.granted
        ) {

          permission =
            await Notifications.requestPermissionsAsync();

        }

        if (
          !permission.granted
        ) {

          Alert.alert(
            "Izin diperlukan",
            "Izinkan notifikasi terlebih dahulu."
          );

          return;

        }

        await Notifications.scheduleNotificationAsync(
          {
            content: {
              title:
                "💙 Navacare",
              body:
                "Tes notifikasi berhasil."
            },
            trigger:
              null
          }
        );

        Alert.alert(
          "Berhasil",
          "Notifikasi tes sudah dijadwalkan."
        );

      } catch (error) {

        console.log(
          "Test notification:",
          error
        );

      }

    };

  /* =======================================================
     NILAI TURUNAN
  ======================================================= */

  const distanceKm =
    distance / 1000;

  const currentPace =
    formatPace(
      duration,
      distance
    );

  const currentCalories =
    calculateCalories(
      recordMode,
      Number(weight) || 60,
      duration,
      speed
    );

  const stepProgress =
    Math.min(
      100,
      Math.round(
        (todaySteps /
          10000) *
          100
      )
    );

  /* =======================================================
     HOME
  ======================================================= */

  const renderHome =
    () => {

      return (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
          }
        >

          <View
            style={
              styles.homeHeader
            }
          >

            <View>

              <Text
                style={[
                  styles.greeting,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                Selamat datang 👋
              </Text>

              <Text
                style={[
                  styles.homeTitle,
                  {
                    color:
                      C.text
                  }
                ]}
              >
                Tetap aktif hari ini
              </Text>

            </View>

            <View
              style={[
                styles.headerAvatar,
                {
                  backgroundColor:
                    C.primarySoft
                }
              ]}
            >

              <Ionicons
                name="fitness"
                size={22}
                color={
                  C.primary
                }
              />

            </View>

          </View>

          <View
            style={[
              styles.stepHero,
              {
                backgroundColor:
                  C.primary
              }
            ]}
          >

            <View
              style={
                styles.stepHeroTop
              }
            >

              <View>

                <Text
                  style={
                    styles.heroCaption
                  }
                >
                  LANGKAH HARI INI
                </Text>

                <Text
                  style={
                    styles.heroSteps
                  }
                >
                  {todaySteps.toLocaleString(
                    "id-ID"
                  )}
                </Text>

                <Text
                  style={
                    styles.heroTarget
                  }
                >
                  target 10.000 langkah
                </Text>

              </View>

              <View
                style={
                  styles.heroIcon
                }
              >

                <Ionicons
                  name="footsteps"
                  size={32}
                  color="#FFFFFF"
                />

              </View>

            </View>

            <View
              style={
                styles.heroProgress
              }
            >

              <View
                style={[
                  styles.heroProgressFill,
                  {
                    width:
                      `${stepProgress}%`
                  }
                ]}
              />

            </View>

            <View
              style={
                styles.heroProgressRow
              }
            >

              <Text
                style={
                  styles.heroProgressText
                }
              >
                {stepProgress}% tercapai
              </Text>

              <Text
                style={
                  styles.heroProgressText
                }
              >
                {stepPermission ===
                "granted"
                  ? "Sensor aktif"
                  : "Sensor belum aktif"}
              </Text>

            </View>

          </View>

          <View
            style={
              styles.homeSection
            }
          >

            <Text
              style={[
                styles.sectionTitle,
                {
                  color:
                    C.text
                }
              ]}
            >
              Mulai sekarang
            </Text>

            <View
              style={
                styles.homeActionRow
              }
            >

              <Pressable
                style={[
                  styles.homeActionPrimary,
                  {
                    backgroundColor:
                      C.primary
                  }
                ]}
                onPress={() =>
                  setActiveTab(
                    "record"
                  )
                }
              >

                <Ionicons
                  name="play"
                  size={20}
                  color="#FFFFFF"
                />

                <View
                  style={{
                    flex: 1
                  }}
                >

                  <Text
                    style={
                      styles.actionPrimaryTitle
                    }
                  >
                    Mulai aktivitas
                  </Text>

                  <Text
                    style={
                      styles.actionPrimarySubtitle
                    }
                  >
                    Jogging atau jalan
                  </Text>

                </View>

                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color="#FFFFFF"
                />

              </Pressable>

            </View>

          </View>

          <View
            style={
              styles.homeSection
            }
          >

            <View
              style={
                styles.sectionHeaderRow
              }
            >

              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color:
                      C.text
                  }
                ]}
              >
                Aktivitas terakhir
              </Text>

              {lastWorkout ? (
                <Text
                  style={[
                    styles.sectionHint,
                    {
                      color:
                        C.muted
                    }
                  ]}
                >
                  Tersimpan
                </Text>
              ) : null}

            </View>

            {lastWorkout ? (

              <View
                style={[
                  styles.workoutSummary,
                  {
                    backgroundColor:
                      C.card,

                    borderColor:
                      C.border
                  }
                ]}
              >

                <View
                  style={
                    styles.workoutSummaryHeader
                  }
                >

                  <View
                    style={[
                      styles.workoutIcon,
                      {
                        backgroundColor:
                          C.greenSoft
                      }
                    ]}
                  >

                    <Ionicons
                      name={
                        lastWorkout.mode ===
                        "jogging"
                          ? "walk"
                          : "footsteps"
                      }
                      size={23}
                      color={
                        C.green
                      }
                    />

                  </View>

                  <View
                    style={{
                      flex: 1
                    }}
                  >

                    <Text
                      style={[
                        styles.workoutTitle,
                        {
                          color:
                            C.text
                        }
                      ]}
                    >
                      {lastWorkout.mode ===
                      "jogging"
                        ? "Jogging"
                        : "Jalan"}
                    </Text>

                    <Text
                      style={[
                        styles.workoutDate,
                        {
                          color:
                            C.muted
                        }
                      ]}
                    >
                      {lastWorkout.date}
                    </Text>

                  </View>

                </View>

                <View
                  style={
                    styles.workoutMetrics
                  }
                >

                  <Metric
                    value={
                      formatDistance(
                        lastWorkout.distance
                      )
                    }
                    label="Jarak"
                    C={C}
                  />

                  <Metric
                    value={
                      formatDuration(
                        lastWorkout.duration
                      )
                    }
                    label="Durasi"
                    C={C}
                  />

                  <Metric
                    value={
                      String(
                        lastWorkout.steps
                      )
                    }
                    label="Langkah"
                    C={C}
                  />

                  <Metric
                    value={
                      `${lastWorkout.calories} kcal`
                    }
                    label="Kalori"
                    C={C}
                  />

                </View>

              </View>

            ) : (

              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor:
                      C.card,

                    borderColor:
                      C.border
                  }
                ]}
              >

                <Ionicons
                  name="analytics-outline"
                  size={28}
                  color={
                    C.primary
                  }
                />

                <Text
                  style={[
                    styles.emptyTitle,
                    {
                      color:
                        C.text
                    }
                  ]}
                >
                  Belum ada aktivitas
                </Text>

                <Text
                  style={[
                    styles.emptyText,
                    {
                      color:
                        C.muted
                    }
                  ]}
                >
                  Rekam aktivitas pertama kamu
                  dari menu Rekam.
                </Text>

              </View>

            )}

          </View>

          <View
            style={
              styles.homeSection
            }
          >

            <Text
              style={[
                styles.sectionTitle,
                {
                  color:
                    C.text
                }
              ]}
            >
              Fitur
            </Text>

            <View
              style={
                styles.featureGrid
              }
            >

              <Feature
                icon="map-outline"
                title="Peta"
                text="Lihat lokasi"
                C={C}
                onPress={() =>
                  setActiveTab(
                    "map"
                  )
                }
              />

              <Feature
                icon="calculator-outline"
                title="BMI"
                text="Cek tubuh"
                C={C}
                onPress={() =>
                  setActiveTab(
                    "bmi"
                  )
                }
              />

              <Feature
                icon="footsteps-outline"
                title="Langkah"
                text={
                  stepPermission ===
                  "granted"
                    ? "Sensor aktif"
                    : "Aktifkan sensor"
                }
                C={C}
                onPress={
                  enableStepSensor
                }
              />

              <Feature
                icon="person-outline"
                title="Profile"
                text="Pengaturan"
                C={C}
                onPress={() =>
                  setActiveTab(
                    "profile"
                  )
                }
              />

            </View>

          </View>

        </ScrollView>
      );
    };

  /* =======================================================
     PETA
  ======================================================= */

  const renderMap =
    () => {

      return (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
          }
        >

          <PageHeader
            title="Peta"
            subtitle="Lokasi GPS dan rute aktivitas"
            icon="map"
            C={C}
          />

          <View
            style={[
              styles.mapCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <View
              style={
                styles.mapCardHeader
              }
            >

              <View
                style={{
                  flex: 1
                }}
              >

                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color:
                        C.text
                    }
                  ]}
                >
                  Lokasi saat ini
                </Text>

                <Text
                  style={[
                    styles.cardSubtitle,
                    {
                      color:
                        C.muted
                    }
                  ]}
                >
                  {gpsStatus}
                </Text>

              </View>

              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      locationPermission
                        ? C.greenSoft
                        : C.orangeSoft
                  }
                ]}
              >

                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        locationPermission
                          ? C.green
                          : C.orange
                    }
                  ]}
                />

                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        locationPermission
                          ? C.green
                          : C.orange
                    }
                  ]}
                >
                  {locationPermission
                    ? "AKTIF"
                    : "BELUM"}
                </Text>

              </View>

            </View>

            <LeafletMap
              currentLocation={
                currentLocation
              }
              route={
                route
              }
              C={C}
              height={
                400
              }
              follow={
                false
              }
            />

            <Pressable
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    C.primary
                }
              ]}
              onPress={
                requestLocation
              }
            >

              <Ionicons
                name="locate"
                size={19}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.primaryButtonText
                }
              >
                Aktifkan GPS
              </Text>

            </Pressable>

          </View>

          <View
            style={[
              styles.mapInfo,
              {
                backgroundColor:
                  C.primarySoft
              }
            ]}
          >

            <Ionicons
              name="information-circle-outline"
              size={21}
              color={
                C.primary
              }
            />

            <Text
              style={[
                styles.mapInfoText,
                {
                  color:
                    C.text
                }
              ]}
            >
              Peta menggunakan OpenStreetMap.
              Saat aktivitas direkam, garis rute
              akan mengikuti posisi GPS.
            </Text>

          </View>

        </ScrollView>
      );
    };

  /* =======================================================
     REKAM
  ======================================================= */

  const renderRecord =
    () => {

      return (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
          }
        >

          <PageHeader
            title="Rekam"
            subtitle="Satu tempat untuk seluruh aktivitasmu"
            icon="radio-button-on"
            C={C}
          />

          <View
            style={
              styles.activitySelector
            }
          >

            <ActivityType
              active={
                recordMode ===
                "jogging"
              }
              icon="walk"
              label="Jogging"
              disabled={
                recordStatus ===
                  "tracking" ||
                recordStatus ===
                  "paused"
              }
              C={C}
              onPress={() =>
                setRecordMode(
                  "jogging"
                )
              }
            />

            <ActivityType
              active={
                recordMode ===
                "jalan"
              }
              icon="footsteps"
              label="Jalan"
              disabled={
                recordStatus ===
                  "tracking" ||
                recordStatus ===
                  "paused"
              }
              C={C}
              onPress={() =>
                setRecordMode(
                  "jalan"
                )
              }
            />

          </View>

          <View
            style={[
              styles.liveCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <View
              style={
                styles.liveHeader
              }
            >

              <View>

                <Text
                  style={[
                    styles.liveMode,
                    {
                      color:
                        C.text
                    }
                  ]}
                >
                  {recordMode ===
                  "jogging"
                    ? "Jogging"
                    : "Jalan"}
                </Text>

                <Text
                  style={[
                    styles.liveDate,
                    {
                      color:
                        C.muted
                    }
                  ]}
                >
                  {recordStatus ===
                  "tracking"
                    ? "Sedang merekam"
                    : recordStatus ===
                      "paused"
                    ? "Aktivitas dijeda"
                    : "Siap digunakan"}
                </Text>

              </View>

              <View
                style={[
                  styles.liveStatus,
                  {
                    backgroundColor:
                      recordStatus ===
                      "tracking"
                        ? C.greenSoft
                        : C.card2
                  }
                ]}
              >

                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        recordStatus ===
                        "tracking"
                          ? C.green
                          : C.muted
                    }
                  ]}
                />

                <Text
                  style={[
                    styles.liveStatusText,
                    {
                      color:
                        recordStatus ===
                        "tracking"
                          ? C.green
                          : C.muted
                    }
                  ]}
                >
                  {recordStatus ===
                  "tracking"
                    ? "LIVE"
                    : recordStatus ===
                      "paused"
                    ? "PAUSE"
                    : "READY"}
                </Text>

              </View>

            </View>

            <View
              style={
                styles.timerArea
              }
            >

              <Text
                style={[
                  styles.timerCaption,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                DURASI
              </Text>

              <Text
                style={[
                  styles.timerValue,
                  {
                    color:
                      C.text
                  }
                ]}
              >
                {formatDuration(
                  duration
                )}
              </Text>

            </View>

            <View
              style={
                styles.mainMetrics
              }
            >

              <LiveMetric
                icon="navigate"
                value={
                  distanceKm.toFixed(
                    2
                  )
                }
                unit="km"
                label="Jarak"
                C={C}
              />

              <LiveMetric
                icon="speedometer"
                value={
                  speed.toFixed(1)
                }
                unit="km/j"
                label="Kecepatan"
                C={C}
              />

              <LiveMetric
                icon="timer-outline"
                value={
                  currentPace
                }
                unit="/km"
                label="Pace"
                C={C}
              />

              <LiveMetric
                icon="flame"
                value={
                  String(
                    currentCalories
                  )
                }
                unit="kcal"
                label="Kalori"
                C={C}
              />

              <LiveMetric
                icon="footsteps"
                value={
                  String(
                    sessionSteps
                  )
                }
                unit=""
                label="Langkah"
                C={C}
              />

              <LiveMetric
                icon="locate"
                value={
                  gpsAccuracy
                    ? String(
                        Math.round(
                          gpsAccuracy
                        )
                      )
                    : "--"
                }
                unit="m"
                label="GPS"
                C={C}
              />

            </View>

            <View
              style={
                styles.gpsLine
              }
            >

              <Ionicons
                name="location-outline"
                size={17}
                color={
                  locationPermission
                    ? C.green
                    : C.orange
                }
              />

              <Text
                style={[
                  styles.gpsLineText,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                {gpsStatus}
              </Text>

            </View>

          </View>

          <View
            style={[
              styles.routeCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <View
              style={
                styles.routeHeader
              }
            >

              <View>

                <Text
                  style={[
                    styles.cardTitle,
                    {
                      color:
                        C.text
                    }
                  ]}
                >
                  Rute
                </Text>

                <Text
                  style={[
                    styles.cardSubtitle,
                    {
                      color:
                        C.muted
                    }
                  ]}
                >
                  {route.length > 1
                    ? `${route.length} titik GPS`
                    : "Belum ada rute"}
                </Text>

              </View>

              <Pressable
                onPress={() =>
                  setAutoFollow(
                    (value) =>
                      !value
                  )
                }
                style={[
                  styles.followButton,
                  {
                    backgroundColor:
                      autoFollow
                        ? C.primarySoft
                        : C.card2,

                    borderColor:
                      C.border
                  }
                ]}
              >

                <Ionicons
                  name={
                    autoFollow
                      ? "locate"
                      : "locate-outline"
                  }
                  size={17}
                  color={
                    C.primary
                  }
                />

                <Text
                  style={[
                    styles.followButtonText,
                    {
                      color:
                        C.primary
                    }
                  ]}
                >
                  {autoFollow
                    ? "Ikuti"
                    : "Manual"}
                </Text>

              </Pressable>

            </View>

            <LeafletMap
              currentLocation={
                currentLocation
              }
              route={
                route
              }
              C={C}
              height={
                280
              }
              follow={
                autoFollow &&
                recordStatus ===
                  "tracking"
              }
            />

          </View>

          <View
            style={
              styles.recordControls
            }
          >

            {recordStatus ===
            "ready" ? (

              <Pressable
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor:
                      C.primary
                  }
                ]}
                onPress={
                  startActivity
                }
              >

                <Ionicons
                  name="play"
                  size={20}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Mulai Aktivitas
                </Text>

              </Pressable>

            ) : recordStatus ===
              "tracking" ? (

              <View
                style={
                  styles.controlRow
                }
              >

                <Pressable
                  style={[
                    styles.secondaryControl,
                    {
                      backgroundColor:
                        C.orange
                    }
                  ]}
                  onPress={
                    pauseActivity
                  }
                >

                  <Ionicons
                    name="pause"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.controlText
                    }
                  >
                    Pause
                  </Text>

                </Pressable>

                <Pressable
                  style={[
                    styles.secondaryControl,
                    {
                      backgroundColor:
                        C.red
                    }
                  ]}
                  onPress={
                    stopActivity
                  }
                >

                  <Ionicons
                    name="stop"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.controlText
                    }
                  >
                    Selesai
                  </Text>

                </Pressable>

              </View>

            ) : (

              <View
                style={
                  styles.controlRow
                }
              >

                <Pressable
                  style={[
                    styles.secondaryControl,
                    {
                      backgroundColor:
                        C.primary
                    }
                  ]}
                  onPress={
                    resumeActivity
                  }
                >

                  <Ionicons
                    name="play"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.controlText
                    }
                  >
                    Lanjut
                  </Text>

                </Pressable>

                <Pressable
                  style={[
                    styles.secondaryControl,
                    {
                      backgroundColor:
                        C.red
                    }
                  ]}
                  onPress={
                    stopActivity
                  }
                >

                  <Ionicons
                    name="stop"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.controlText
                    }
                  >
                    Selesai
                  </Text>

                </Pressable>

              </View>

            )}

            <Pressable
              style={[
                styles.resetButton,
                {
                  borderColor:
                    C.border
                }
              ]}
              onPress={
                resetActivity
              }
            >

              <Ionicons
                name="refresh"
                size={17}
                color={
                  C.muted
                }
              />

              <Text
                style={[
                  styles.resetText,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                Reset rute & aktivitas
              </Text>

            </Pressable>

          </View>

        </ScrollView>
      );
    };

  /* =======================================================
     BMI
  ======================================================= */

  const renderBMI =
    () => {

      return (
        <KeyboardAvoidingView
          style={{
            flex: 1
          }}
          behavior={
            Platform.OS ===
            "ios"
              ? "padding"
              : undefined
          }
        >

          <ScrollView
            style={styles.screen}
            contentContainerStyle={
              styles.scrollContent
            }
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={
              false
            }
          >

            <PageHeader
              title="BMI"
              subtitle="Cek indeks massa tubuh"
              icon="calculator"
              C={C}
            />

            <View
              style={[
                styles.formCard,
                {
                  backgroundColor:
                    C.card,

                  borderColor:
                    C.border
                }
              ]}
            >

              <Text
                style={[
                  styles.formLabel,
                  {
                    color:
                      C.text
                  }
                ]}
              >
                Jenis kelamin
              </Text>

              <View
                style={
                  styles.genderRow
                }
              >

                <GenderButton
                  value="male"
                  label="Laki-laki"
                  icon="male"
                  active={
                    gender ===
                    "male"
                  }
                  C={C}
                  onPress={() =>
                    setGender(
                      "male"
                    )
                  }
                />

                <GenderButton
                  value="female"
                  label="Perempuan"
                  icon="female"
                  active={
                    gender ===
                    "female"
                  }
                  C={C}
                  onPress={() =>
                    setGender(
                      "female"
                    )
                  }
                />

              </View>

              <FormInput
                label="Usia"
                value={age}
                placeholder="Contoh 17"
                suffix="tahun"
                C={C}
                keyboardType="number-pad"
                onChangeText={(value) =>
                  setAge(
                    value.replace(
                      /\D/g,
                      ""
                    )
                  )
                }
              />

              <FormInput
                label="Berat badan"
                value={weight}
                placeholder="Contoh 55"
                suffix="kg"
                C={C}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setWeight(
                    cleanNumber(
                      value
                    )
                  )
                }
              />

              <FormInput
                label="Tinggi badan"
                value={height}
                placeholder="Contoh 165"
                suffix="cm"
                C={C}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setHeight(
                    cleanNumber(
                      value
                    )
                  )
                }
              />

              <Pressable
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor:
                      C.primary
                  }
                ]}
                onPress={
                  calculateBMI
                }
              >

                <Ionicons
                  name="calculator"
                  size={19}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Hitung BMI
                </Text>

              </Pressable>

            </View>

            {bmiInfo ? (

              <View
                style={[
                  styles.bmiResult,
                  {
                    backgroundColor:
                      C.card,

                    borderColor:
                      C.border
                  }
                ]}
              >

                <View
                  style={
                    styles.bmiResultHeader
                  }
                >

                  <View>

                    <Text
                      style={[
                        styles.bmiCaption,
                        {
                          color:
                            C.muted
                        }
                      ]}
                    >
                      HASIL BMI
                    </Text>

                    <Text
                      style={[
                        styles.bmiNumber,
                        {
                          color:
                            C.text
                        }
                      ]}
                    >
                      {bmi}
                    </Text>

                  </View>

                  <View
                    style={[
                      styles.bmiCategory,
                      {
                        backgroundColor:
                          `${bmiInfo.color}22`
                      }
                    ]}
                  >

                    <Ionicons
                      name={
                        bmiInfo.icon
                      }
                      size={18}
                      color={
                        bmiInfo.color
                      }
                    />

                    <Text
                      style={[
                        styles.bmiCategoryText,
                        {
                          color:
                            bmiInfo.color
                        }
                      ]}
                    >
                      {
                        bmiInfo.category
                      }
                    </Text>

                  </View>

                </View>

                <View
                  style={[
                    styles.bmiNormalBox,
                    {
                      backgroundColor:
                        C.primarySoft
                    }
                  ]}
                >

                  <Text
                    style={[
                      styles.bmiNormalTitle,
                      {
                        color:
                          C.muted
                      }
                    ]}
                  >
                    Rentang BMI normal
                  </Text>

                  <Text
                    style={[
                      styles.bmiNormalValue,
                      {
                        color:
                          C.primary
                      }
                    ]}
                  >
                    18,5 – 24,9
                  </Text>

                </View>

                <View
                  style={[
                    styles.idealWeight,
                    {
                      backgroundColor:
                        C.card2
                    }
                  ]}
                >

                  <Ionicons
                    name="body"
                    size={23}
                    color={
                      C.primary
                    }
                  />

                  <View
                    style={{
                      flex: 1
                    }}
                  >

                    <Text
                      style={[
                        styles.idealTitle,
                        {
                          color:
                            C.text
                        }
                      ]}
                    >
                      Rentang berat ideal
                    </Text>

                    <Text
                      style={[
                        styles.idealValue,
                        {
                          color:
                            C.primary
                        }
                      ]}
                    >
                      {
                        bmiInfo.minWeight
                      }
                      {" – "}
                      {
                        bmiInfo.maxWeight
                      }
                      {" kg"}
                    </Text>

                  </View>

                </View>

                <Text
                  style={[
                    styles.bmiNote,
                    {
                      color:
                        C.muted
                    }
                  ]}
                >
                  BMI merupakan indikator umum,
                  bukan diagnosis medis.
                </Text>

              </View>

            ) : null}

          </ScrollView>

        </KeyboardAvoidingView>
      );
    };

  /* =======================================================
     PROFILE
  ======================================================= */

  const renderProfile =
    () => {

      return (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={
            styles.scrollContent
          }
          showsVerticalScrollIndicator={
            false
          }
        >

          <PageHeader
            title="Profile"
            subtitle="Pengaturan Navacare"
            icon="person"
            C={C}
          />

          <View
            style={[
              styles.profileHero,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <View
              style={[
                styles.profileAvatar,
                {
                  backgroundColor:
                    C.primary
                }
              ]}
            >

              <Ionicons
                name="person"
                size={31}
                color="#FFFFFF"
              />

            </View>

            <View
              style={{
                flex: 1
              }}
            >

              <Text
                style={[
                  styles.profileTitle,
                  {
                    color:
                      C.text
                  }
                ]}
              >
                Pengguna Navacare
              </Text>

              <Text
                style={[
                  styles.profileSubtitle,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                Tetap aktif, tetap sehat 💙
              </Text>

            </View>

          </View>

          <View
            style={[
              styles.settingCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <SettingRow
              icon="moon"
              title="Mode gelap"
              subtitle={
                darkMode
                  ? "Aktif"
                  : "Nonaktif"
              }
              C={C}
              right={
                <Switch
                  value={
                    darkMode
                  }
                  onValueChange={
                    setDarkMode
                  }
                  trackColor={{
                    false:
                      "#CBD5E1",
                    true:
                      C.primary
                  }}
                  thumbColor="#FFFFFF"
                />
              }
            />

          </View>

          <View
            style={[
              styles.settingCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <SettingRow
              icon="footsteps"
              title="Sensor langkah"
              subtitle={
                stepPermission ===
                "granted"
                  ? "Sensor aktif"
                  : stepPermission ===
                    "unavailable"
                  ? "Tidak tersedia"
                  : "Belum diaktifkan"
              }
              C={C}
              right={
                <View
                  style={[
                    styles.sensorStatus,
                    {
                      backgroundColor:
                        stepPermission ===
                        "granted"
                          ? C.greenSoft
                          : C.orangeSoft
                    }
                  ]}
                >

                  <Text
                    style={[
                      styles.sensorStatusText,
                      {
                        color:
                          stepPermission ===
                          "granted"
                            ? C.green
                            : C.orange
                      }
                    ]}
                  >
                    {stepPermission ===
                    "granted"
                      ? "AKTIF"
                      : "AKTIFKAN"}
                  </Text>

                </View>
              }
            />

            <Pressable
              style={[
                styles.outlineButton,
                {
                  borderColor:
                    C.border
                }
              ]}
              onPress={
                enableStepSensor
              }
            >

              <Ionicons
                name="refresh"
                size={18}
                color={
                  C.primary
                }
              />

              <Text
                style={[
                  styles.outlineButtonText,
                  {
                    color:
                      C.primary
                  }
                ]}
              >
                Aktifkan / cek sensor
              </Text>

            </Pressable>

            <Text
              style={[
                styles.settingNote,
                {
                  color:
                    C.muted
                }
              ]}
            >
              Langkah dihitung saat sensor aktif.
              Kode menggunakan delta langkah agar
              angka tidak dobel saat listener dibuat
              ulang.
            </Text>

          </View>

          <View
            style={[
              styles.settingCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <SettingRow
              icon="water"
              title="Pengingat minum"
              subtitle={
                waterEnabled
                  ? `Setiap ${waterInterval} menit`
                  : "Nonaktif"
              }
              C={C}
              right={
                <Switch
                  value={
                    waterEnabled
                  }
                  onValueChange={
                    toggleWater
                  }
                  trackColor={{
                    false:
                      "#CBD5E1",
                    true:
                      C.primary
                  }}
                  thumbColor="#FFFFFF"
                />
              }
            />

            <View
              style={
                styles.divider
              }
            />

            <Text
              style={[
                styles.intervalTitle,
                {
                  color:
                    C.text
                }
              ]}
            >
              Interval pengingat
            </Text>

            <View
              style={
                styles.intervalRow
              }
            >

              {[30, 60, 90, 120].map(
                (minutes) => (

                  <Pressable
                    key={
                      minutes
                    }
                    style={[
                      styles.intervalButton,
                      {
                        backgroundColor:
                          waterInterval ===
                          minutes
                            ? C.primarySoft
                            : C.card2,

                        borderColor:
                          waterInterval ===
                          minutes
                            ? C.primary
                            : C.border
                      }
                    ]}
                    onPress={() =>
                      changeWaterInterval(
                        minutes
                      )
                    }
                  >

                    <Text
                      style={[
                        styles.intervalText,
                        {
                          color:
                            waterInterval ===
                            minutes
                              ? C.primary
                              : C.text
                        }
                      ]}
                    >
                      {minutes}m
                    </Text>

                  </Pressable>

                )
              )}

            </View>

            <Pressable
              style={[
                styles.outlineButton,
                {
                  borderColor:
                    C.border
                }
              ]}
              onPress={
                testNotification
              }
            >

              <Ionicons
                name="notifications-outline"
                size={18}
                color={
                  C.primary
                }
              />

              <Text
                style={[
                  styles.outlineButtonText,
                  {
                    color:
                      C.primary
                  }
                ]}
              >
                Tes notifikasi
              </Text>

            </Pressable>

            {notificationUnavailable ? (

              <Text
                style={[
                  styles.settingNote,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                Pengujian notifikasi lokal membutuhkan
                development build. Expo Go tidak
                digunakan untuk bagian ini.
              </Text>

            ) : null}

          </View>

          <View
            style={[
              styles.aboutCard,
              {
                backgroundColor:
                  C.card,

                borderColor:
                  C.border
              }
            ]}
          >

            <View
              style={[
                styles.aboutIcon,
                {
                  backgroundColor:
                    C.primarySoft
                }
              ]}
            >

              <Ionicons
                name="fitness"
                size={23}
                color={
                  C.primary
                }
              />

            </View>

            <Text
              style={[
                styles.aboutTitle,
                {
                  color:
                    C.text
                }
              ]}
            >
              Navacare
            </Text>

            <Text
              style={[
                styles.aboutText,
                {
                  color:
                    C.muted
                }
              ]}
            >
              Aplikasi aktivitas dan kesehatan
              untuk memantau langkah, GPS,
              jogging, jalan, BMI, dan hidrasi.
            </Text>

            <Text
              style={[
                styles.version,
                {
                  color:
                    C.muted
                }
              ]}
            >
              Versi 1.0.0
            </Text>

          </View>

        </ScrollView>
      );
    };

  /* =======================================================
     CURRENT SCREEN
  ======================================================= */

  const renderScreen =
    () => {

      switch (
        activeTab
      ) {

        case "map":
          return renderMap();

        case "record":
          return renderRecord();

        case "bmi":
          return renderBMI();

        case "profile":
          return renderProfile();

        default:
          return renderHome();

      }

    };

  /* =======================================================
     SPLASH
  ======================================================= */

  if (showSplash) {

    return (

      <Animated.View
        style={[
          styles.splash,
          {
            backgroundColor:
              C.bg,

            opacity:
              splashOpacity
          }
        ]}
      >

        <Animated.View
          style={[
            styles.splashLogo,
            {
              backgroundColor:
                C.primary,

              transform: [
                {
                  scale:
                    splashScale
                }
              ]
            }
          ]}
        >

          <Image
            source={require("./navacare-logo.jpeg")}
            style={styles.splashLogoImage}
            resizeMode="contain"
          />

        </Animated.View>

        <Text
          style={[
            styles.splashTitle,
            {
              color:
                C.text
            }
          ]}
        >
          Navacare
        </Text>

        <Text
          style={[
            styles.splashSubtitle,
            {
              color:
                C.muted
            }
          ]}
        >
          Stay Active, Stay Healthy
        </Text>

        <ActivityIndicator
          size="small"
          color={
            C.primary
          }
          style={{
            marginTop: 24
          }}
        />

      </Animated.View>

    );

  }

  /* =======================================================
     MAIN APP
  ======================================================= */

  return (

    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor:
            C.bg
        }
      ]}
    >

      <StatusBar
        barStyle={
          darkMode
            ? "light-content"
            : "dark-content"
        }
        backgroundColor={
          C.bg
        }
      />

      <View
        style={
          styles.content
        }
      >
        {renderScreen()}
      </View>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor:
              C.card,

            borderTopColor:
              C.border
          }
        ]}
      >

        <BottomItem
          label="Home"
          icon="home-outline"
          activeIcon="home"
          active={
            activeTab ===
            "home"
          }
          C={C}
          onPress={() =>
            setActiveTab(
              "home"
            )
          }
        />

        <BottomItem
          label="Peta"
          icon="map-outline"
          activeIcon="map"
          active={
            activeTab ===
            "map"
          }
          C={C}
          onPress={() =>
            setActiveTab(
              "map"
            )
          }
        />

        <BottomItem
          label="Rekam"
          icon="radio-button-on-outline"
          activeIcon="radio-button-on"
          active={
            activeTab ===
            "record"
          }
          C={C}
          center
          onPress={() =>
            setActiveTab(
              "record"
            )
          }
        />

        <BottomItem
          label="BMI"
          icon="calculator-outline"
          activeIcon="calculator"
          active={
            activeTab ===
            "bmi"
          }
          C={C}
          onPress={() =>
            setActiveTab(
              "bmi"
            )
          }
        />

        <BottomItem
          label="Profile"
          icon="person-outline"
          activeIcon="person"
          active={
            activeTab ===
            "profile"
          }
          C={C}
          onPress={() =>
            setActiveTab(
              "profile"
            )
          }
        />

      </View>

    </SafeAreaView>

  );
}

/* =========================================================
   COMPONENT: PAGE HEADER
========================================================= */

function PageHeader({
  title,
  subtitle,
  icon,
  C
}) {

  return (

    <View
      style={
        styles.pageHeader
      }
    >

      <View
        style={[
          styles.pageIcon,
          {
            backgroundColor:
              C.primarySoft
          }
        ]}
      >

        <Ionicons
          name={icon}
          size={23}
          color={
            C.primary
          }
        />

      </View>

      <View
        style={{
          flex: 1
        }}
      >

        <Text
          style={[
            styles.pageTitle,
            {
              color:
                C.text
            }
          ]}
        >
          {title}
        </Text>

        <Text
          style={[
            styles.pageSubtitle,
            {
              color:
                C.muted
            }
          ]}
        >
          {subtitle}
        </Text>

      </View>

    </View>

  );
}

/* =========================================================
   COMPONENT: METRIC
========================================================= */

function Metric({
  value,
  label,
  C
}) {

  return (

    <View
      style={
        styles.metricItem
      }
    >

      <Text
        style={[
          styles.metricValue,
          {
            color:
              C.text
          }
        ]}
      >
        {value}
      </Text>

      <Text
        style={[
          styles.metricLabel,
          {
            color:
              C.muted
          }
        ]}
      >
        {label}
      </Text>

    </View>

  );
}

/* =========================================================
   COMPONENT: FEATURE
========================================================= */

function Feature({
  icon,
  title,
  text,
  onPress,
  C
}) {

  return (

    <Pressable
      style={[
        styles.feature,
        {
          backgroundColor:
            C.card,

          borderColor:
            C.border
        }
      ]}
      onPress={
        onPress
      }
    >

      <View
        style={[
          styles.featureIcon,
          {
            backgroundColor:
              C.primarySoft
          }
        ]}
      >

        <Ionicons
          name={icon}
          size={21}
          color={
            C.primary
          }
        />

      </View>

      <Text
        style={[
          styles.featureTitle,
          {
            color:
              C.text
          }
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          styles.featureText,
          {
            color:
              C.muted
          }
        ]}
      >
        {text}
      </Text>

    </Pressable>

  );
}

/* =========================================================
   COMPONENT: LIVE METRIC
========================================================= */

function LiveMetric({
    icon,
    value,
    unit,
    label,
    C
  }) {
  
    return (
  
      <View
        style={[
          styles.liveMetric,
          {
            backgroundColor:
              C.card2
          }
        ]}
      >
  
        <View
          style={[
            styles.liveMetricIcon,
            {
              backgroundColor:
                C.primarySoft
            }
          ]}
        >
  
          <Ionicons
            name={icon}
            size={18}
            color={
              C.primary
            }
          />
  
        </View>
  
        <View
          style={
            styles.liveMetricText
          }
        >
  
          <Text
            style={[
              styles.liveMetricValue,
              {
                color:
                  C.text
              }
            ]}
          >
            {value}
  
            {unit ? (
              <Text
                style={[
                  styles.liveMetricUnit,
                  {
                    color:
                      C.muted
                  }
                ]}
              >
                {" "}
                {unit}
              </Text>
            ) : null}
  
          </Text>
  
          <Text
            style={[
              styles.liveMetricLabel,
              {
                color:
                  C.muted
              }
            ]}
          >
            {label}
          </Text>
  
        </View>
  
      </View>
  
    );
  }
  
  /* =========================================================
     COMPONENT: ACTIVITY TYPE
  ========================================================= */
  
  function ActivityType({
    active,
    icon,
    label,
    disabled,
    onPress,
    C
  }) {
  
    return (
  
      <Pressable
        disabled={
          disabled
        }
        onPress={
          onPress
        }
        style={[
          styles.activityType,
          {
            backgroundColor:
              active
                ? C.primarySoft
                : C.card,
  
            borderColor:
              active
                ? C.primary
                : C.border,
  
            opacity:
              disabled &&
              !active
                ? 0.5
                : 1
          }
        ]}
      >
  
        <Ionicons
          name={icon}
          size={21}
          color={
            active
              ? C.primary
              : C.muted
          }
        />
  
        <Text
          style={[
            styles.activityTypeText,
            {
              color:
                active
                  ? C.primary
                  : C.text
            }
          ]}
        >
          {label}
        </Text>
  
      </Pressable>
  
    );
  }
  
  /* =========================================================
     COMPONENT: FORM INPUT
  ========================================================= */
  
  function FormInput({
    label,
    value,
    placeholder,
    suffix,
    keyboardType,
    onChangeText,
    C
  }) {
  
    return (
  
      <View
        style={
          styles.inputGroup
        }
      >
  
        <Text
          style={[
            styles.formLabel,
            {
              color:
                C.text
            }
          ]}
        >
          {label}
        </Text>
  
        <View
          style={[
            styles.inputWrap,
            {
              backgroundColor:
                C.card2,
  
              borderColor:
                C.border
            }
          ]}
        >
  
          <TextInput
            value={
              value
            }
            onChangeText={
              onChangeText
            }
            placeholder={
              placeholder
            }
            placeholderTextColor={
              C.muted
            }
            keyboardType={
              keyboardType
            }
            style={[
              styles.input,
              {
                color:
                  C.text
              }
            ]}
            returnKeyType="done"
          />
  
          <Text
            style={[
              styles.inputSuffix,
              {
                color:
                  C.muted
              }
            ]}
          >
            {suffix}
          </Text>
  
        </View>
  
      </View>
  
    );
  }
  
  /* =========================================================
     COMPONENT: GENDER
  ========================================================= */
  
  function GenderButton({
    label,
    icon,
    active,
    C,
    onPress
  }) {
  
    return (
  
      <Pressable
        onPress={
          onPress
        }
        style={[
          styles.genderButton,
          {
            backgroundColor:
              active
                ? C.primarySoft
                : C.card2,
  
            borderColor:
              active
                ? C.primary
                : C.border
          }
        ]}
      >
  
        <Ionicons
          name={icon}
          size={20}
          color={
            active
              ? C.primary
              : C.muted
          }
        />
  
        <Text
          style={[
            styles.genderText,
            {
              color:
                active
                  ? C.primary
                  : C.text
            }
          ]}
        >
          {label}
        </Text>
  
      </Pressable>
  
    );
  }
  
  /* =========================================================
     COMPONENT: SETTING ROW
  ========================================================= */
  
  function SettingRow({
    icon,
    title,
    subtitle,
    right,
    C
  }) {
  
    return (
  
      <View
        style={
          styles.settingRow
        }
      >
  
        <View
          style={[
            styles.settingIcon,
            {
              backgroundColor:
                C.primarySoft
            }
          ]}
        >
  
          <Ionicons
            name={icon}
            size={21}
            color={
              C.primary
            }
          />
  
        </View>
  
        <View
          style={{
            flex: 1
          }}
        >
  
          <Text
            style={[
              styles.settingTitle,
              {
                color:
                  C.text
              }
            ]}
          >
            {title}
          </Text>
  
          <Text
            style={[
              styles.settingSubtitle,
              {
                color:
                  C.muted
              }
            ]}
          >
            {subtitle}
          </Text>
  
        </View>
  
        {right}
  
      </View>
  
    );
  }
  
  /* =========================================================
     COMPONENT: BOTTOM ITEM
  ========================================================= */
  
  function BottomItem({
    label,
    icon,
    activeIcon,
    active,
    onPress,
    C,
    center
  }) {
  
    return (
  
      <Pressable
        style={
          styles.bottomItem
        }
        onPress={
          onPress
        }
      >
  
        <View
          style={[
            styles.bottomIcon,
            center &&
              styles.bottomIconCenter,
            {
              backgroundColor:
                active
                  ? C.primarySoft
                  : "transparent"
            }
          ]}
        >
  
          <Ionicons
            name={
              active
                ? activeIcon
                : icon
            }
            size={
              center
                ? 25
                : 22
            }
            color={
              active
                ? C.primary
                : C.muted
            }
          />
  
        </View>
  
        <Text
          style={[
            styles.bottomLabel,
            {
              color:
                active
                  ? C.primary
                  : C.muted
            }
          ]}
        >
          {label}
        </Text>
  
      </Pressable>
  
    );
  }
  
  /* =========================================================
     STYLES
  ========================================================= */
  
  const styles =
    StyleSheet.create({
  
      container: {
        flex: 1
      },
  
      content: {
        flex: 1
      },
  
      screen: {
        flex: 1
      },
  
      scrollContent: {
        padding: 18,
        paddingBottom: 30
      },
  
      /* SPLASH */
  
      splash: {
        flex: 1,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      splashLogo: {
        width: 112,
        height: 112,
        borderRadius: 34,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginBottom: 22,
        overflow: "hidden"
      },

      splashLogoImage: {
        width: 82,
        height: 82,
        borderRadius: 24
      },
  
      splashTitle: {
        fontSize: 34,
        fontWeight: "800"
      },
  
      splashSubtitle: {
        fontSize: 14,
        marginTop: 6
      },
  
      /* HEADER */
  
      homeHeader: {
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        marginBottom: 18
      },
  
      greeting: {
        fontSize: 14,
        marginBottom: 4
      },
  
      homeTitle: {
        fontSize: 25,
        fontWeight: "800"
      },
  
      headerAvatar: {
        width: 44,
        height: 44,
        borderRadius: 15,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      pageHeader: {
        flexDirection:
          "row",
        alignItems:
          "center",
        marginBottom: 18
      },
  
      pageIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginRight: 12
      },
  
      pageTitle: {
        fontSize: 27,
        fontWeight: "800"
      },
  
      pageSubtitle: {
        fontSize: 13,
        marginTop: 3
      },
  
      /* HOME HERO */
  
      stepHero: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 22
      },
  
      stepHeroTop: {
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "space-between"
      },
  
      heroCaption: {
        color: "#DDE8FF",
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1
      },
  
      heroSteps: {
        color: "#FFFFFF",
        fontSize: 40,
        fontWeight: "800",
        marginTop: 2
      },
  
      heroTarget: {
        color: "#DDE8FF",
        fontSize: 12,
        marginTop: 1
      },
  
      heroIcon: {
        width: 62,
        height: 62,
        borderRadius: 20,
        alignItems:
          "center",
        justifyContent:
          "center",
        backgroundColor:
          "rgba(255,255,255,.17)"
      },
  
      heroProgress: {
        height: 9,
        borderRadius: 99,
        backgroundColor:
          "rgba(255,255,255,.18)",
        overflow: "hidden",
        marginTop: 22
      },
  
      heroProgressFill: {
        height: "100%",
        backgroundColor:
          "#FFFFFF",
        borderRadius: 99
      },
  
      heroProgressRow: {
        flexDirection:
          "row",
        justifyContent:
          "space-between",
        marginTop: 8
      },
  
      heroProgressText: {
        color: "#DDE8FF",
        fontSize: 11
      },
  
      /* HOME SECTIONS */
  
      homeSection: {
        marginBottom: 22
      },
  
      sectionHeaderRow: {
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        marginBottom: 11
      },
  
      sectionTitle: {
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 11
      },
  
      sectionHint: {
        fontSize: 11,
        marginBottom: 11
      },
  
      homeActionRow: {
        width: "100%"
      },
  
      homeActionPrimary: {
        minHeight: 74,
        borderRadius: 18,
        paddingHorizontal: 16,
        flexDirection:
          "row",
        alignItems:
          "center",
        gap: 12
      },
  
      actionPrimaryTitle: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "800"
      },
  
      actionPrimarySubtitle: {
        color: "#DDE8FF",
        fontSize: 12,
        marginTop: 3
      },
  
      workoutSummary: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 16
      },
  
      workoutSummaryHeader: {
        flexDirection:
          "row",
        alignItems:
          "center"
      },
  
      workoutIcon: {
        width: 45,
        height: 45,
        borderRadius: 14,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginRight: 11
      },
  
      workoutTitle: {
        fontSize: 16,
        fontWeight: "800"
      },
  
      workoutDate: {
        fontSize: 11,
        marginTop: 3
      },
  
      workoutMetrics: {
        flexDirection:
          "row",
        justifyContent:
          "space-between",
        marginTop: 17
      },
  
      metricItem: {
        flex: 1
      },
  
      metricValue: {
        fontSize: 14,
        fontWeight: "800"
      },
  
      metricLabel: {
        fontSize: 10,
        marginTop: 3
      },
  
      emptyCard: {
        borderWidth: 1,
        borderRadius: 19,
        padding: 20,
        alignItems:
          "center"
      },
  
      emptyTitle: {
        fontSize: 15,
        fontWeight: "800",
        marginTop: 9
      },
  
      emptyText: {
        fontSize: 12,
        marginTop: 4,
        textAlign:
          "center"
      },
  
      /* FEATURES */
  
      featureGrid: {
        flexDirection:
          "row",
        flexWrap:
          "wrap",
        justifyContent:
          "space-between",
        rowGap: 10
      },
  
      feature: {
        width: "48%",
        minHeight: 118,
        borderWidth: 1,
        borderRadius: 17,
        padding: 14
      },
  
      featureIcon: {
        width: 39,
        height: 39,
        borderRadius: 12,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginBottom: 10
      },
  
      featureTitle: {
        fontSize: 14,
        fontWeight: "800"
      },
  
      featureText: {
        fontSize: 11,
        marginTop: 4
      },
  
      /* BUTTON */
  
      primaryButton: {
        height: 52,
        borderRadius: 15,
        alignItems:
          "center",
        justifyContent:
          "center",
        flexDirection:
          "row",
        gap: 8,
        marginTop: 12
      },
  
      primaryButtonText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "800"
      },
  
      outlineButton: {
        height: 46,
        borderWidth: 1,
        borderRadius: 13,
        alignItems:
          "center",
        justifyContent:
          "center",
        flexDirection:
          "row",
        gap: 7,
        marginTop: 11
      },
  
      outlineButtonText: {
        fontSize: 12,
        fontWeight: "800"
      },
  
      /* MAP */
  
      mapCard: {
        borderWidth: 1,
        borderRadius: 21,
        padding: 12,
        overflow: "hidden"
      },
  
      mapCardHeader: {
        flexDirection:
          "row",
        alignItems:
          "center",
        marginBottom: 10,
        paddingHorizontal: 3
      },
  
      cardTitle: {
        fontSize: 15,
        fontWeight: "800"
      },
  
      cardSubtitle: {
        fontSize: 11,
        marginTop: 3
      },
  
      statusBadge: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection:
          "row",
        alignItems:
          "center",
        gap: 5
      },
  
      statusBadgeText: {
        fontSize: 10,
        fontWeight: "800"
      },
  
      statusDot: {
        width: 7,
        height: 7,
        borderRadius: 99
      },
  
      mapContainer: {
        borderRadius: 16,
        overflow:
          "hidden",
        backgroundColor:
          "#EAF0F7"
      },
  
      map: {
        flex: 1
      },
  
      mapLoading: {
        flex: 1,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      mapLoadingText: {
        fontSize: 12,
        marginTop: 9
      },
  
      mapLocateButton: {
        position:
          "absolute",
        right: 10,
        top: 10,
        width: 44,
        height: 44,
        borderRadius: 13,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      mapAttribution: {
        position:
          "absolute",
        left: 8,
        bottom: 8,
        borderRadius: 7,
        paddingHorizontal: 6,
        paddingVertical: 4
      },
  
      mapAttributionText: {
        fontSize: 9
      },
  
      mapInfo: {
        marginTop: 12,
        borderRadius: 15,
        padding: 13,
        flexDirection:
          "row",
        gap: 9
      },
  
      mapInfoText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 17
      },
  
      /* RECORD */
  
      activitySelector: {
        flexDirection:
          "row",
        justifyContent:
          "space-between",
        marginBottom: 12
      },
  
      activityType: {
        width: "48%",
        minHeight: 50,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "center",
        gap: 7
      },
  
      activityTypeText: {
        fontSize: 13,
        fontWeight: "800"
      },
  
      liveCard: {
        borderWidth: 1,
        borderRadius: 21,
        padding: 16,
        marginBottom: 12
      },
  
      liveHeader: {
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "space-between"
      },
  
      liveMode: {
        fontSize: 17,
        fontWeight: "800"
      },
  
      liveDate: {
        fontSize: 11,
        marginTop: 3
      },
  
      liveStatus: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection:
          "row",
        alignItems:
          "center",
        gap: 5
      },
  
      liveStatusText: {
        fontSize: 10,
        fontWeight: "800"
      },
  
      timerArea: {
        alignItems:
          "center",
        paddingVertical: 15
      },
  
      timerCaption: {
        fontSize: 10,
        letterSpacing: 1.2,
        fontWeight: "800"
      },
  
      timerValue: {
        fontSize: 40,
        fontWeight: "800",
        marginTop: 2
      },
  
      mainMetrics: {
        flexDirection:
          "row",
        flexWrap:
          "wrap",
        justifyContent:
          "space-between",
        rowGap: 8
      },
  
      liveMetric: {
        width: "48.5%",
        minHeight: 69,
        borderRadius: 14,
        padding: 10,
        flexDirection:
          "row",
        alignItems:
          "center"
      },
  
      liveMetricIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginRight: 8
      },
  
      liveMetricText: {
        flex: 1
      },
  
      liveMetricValue: {
        fontSize: 15,
        fontWeight: "800"
      },
  
      liveMetricUnit: {
        fontSize: 9,
        fontWeight: "500"
      },
  
      liveMetricLabel: {
        fontSize: 9,
        marginTop: 2
      },
  
      gpsLine: {
        flexDirection:
          "row",
        alignItems:
          "center",
        marginTop: 12,
        gap: 6
      },
  
      gpsLineText: {
        fontSize: 10
      },
  
      routeCard: {
        borderWidth: 1,
        borderRadius: 21,
        padding: 12,
        overflow:
          "hidden",
        marginBottom: 12
      },
  
      routeHeader: {
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "space-between",
        marginBottom: 9,
        paddingHorizontal: 3
      },
  
      followButton: {
        borderWidth: 1,
        borderRadius: 10,
        minHeight: 34,
        paddingHorizontal: 9,
        flexDirection:
          "row",
        alignItems:
          "center",
        gap: 5
      },
  
      followButtonText: {
        fontSize: 10,
        fontWeight: "800"
      },
  
      recordControls: {
        marginBottom: 10
      },
  
      controlRow: {
        flexDirection:
          "row",
        gap: 10
      },
  
      secondaryControl: {
        flex: 1,
        height: 52,
        borderRadius: 15,
        alignItems:
          "center",
        justifyContent:
          "center",
        flexDirection:
          "row",
        gap: 7
      },
  
      controlText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "800"
      },
  
      resetButton: {
        height: 45,
        borderRadius: 13,
        borderWidth: 1,
        alignItems:
          "center",
        justifyContent:
          "center",
        flexDirection:
          "row",
        gap: 6,
        marginTop: 9
      },
  
      resetText: {
        fontSize: 11,
        fontWeight: "700"
      },
  
      /* BMI */
  
      formCard: {
        borderWidth: 1,
        borderRadius: 21,
        padding: 16
      },
  
      formLabel: {
        fontSize: 12,
        fontWeight: "800",
        marginBottom: 8
      },
  
      genderRow: {
        flexDirection:
          "row",
        justifyContent:
          "space-between",
        marginBottom: 15
      },
  
      genderButton: {
        width: "48%",
        height: 48,
        borderRadius: 13,
        borderWidth: 1,
        alignItems:
          "center",
        justifyContent:
          "center",
        flexDirection:
          "row",
        gap: 6
      },
  
      genderText: {
        fontSize: 12,
        fontWeight: "700"
      },
  
      inputGroup: {
        marginBottom: 13
      },
  
      inputWrap: {
        height: 52,
        borderRadius: 13,
        borderWidth: 1,
        flexDirection:
          "row",
        alignItems:
          "center",
        paddingHorizontal: 13
      },
  
      input: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 0
      },
  
      inputSuffix: {
        fontSize: 11,
        fontWeight: "700"
      },
  
      bmiResult: {
        borderWidth: 1,
        borderRadius: 21,
        padding: 17,
        marginTop: 12
      },
  
      bmiResultHeader: {
        flexDirection:
          "row",
        justifyContent:
          "space-between",
        alignItems:
          "center"
      },
  
      bmiCaption: {
        fontSize: 10,
        letterSpacing: 1,
        fontWeight: "800"
      },
  
      bmiNumber: {
        fontSize: 38,
        fontWeight: "800",
        marginTop: 1
      },
  
      bmiCategory: {
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 8,
        flexDirection:
          "row",
        alignItems:
          "center",
        gap: 5
      },
  
      bmiCategoryText: {
        fontSize: 11,
        fontWeight: "800"
      },
  
      bmiNormalBox: {
        borderRadius: 14,
        padding: 13,
        marginTop: 14
      },
  
      bmiNormalTitle: {
        fontSize: 11,
        fontWeight: "700"
      },
  
      bmiNormalValue: {
        fontSize: 18,
        fontWeight: "800",
        marginTop: 2
      },
  
      idealWeight: {
        marginTop: 10,
        borderRadius: 14,
        padding: 13,
        flexDirection:
          "row",
        alignItems:
          "center",
        gap: 10
      },
  
      idealTitle: {
        fontSize: 11,
        fontWeight: "700"
      },
  
      idealValue: {
        fontSize: 17,
        fontWeight: "800",
        marginTop: 2
      },
  
      bmiNote: {
        fontSize: 10,
        lineHeight: 16,
        marginTop: 11
      },
  
      /* PROFILE */
  
      profileHero: {
        borderWidth: 1,
        borderRadius: 21,
        padding: 16,
        flexDirection:
          "row",
        alignItems:
          "center",
        marginBottom: 12
      },
  
      profileAvatar: {
        width: 60,
        height: 60,
        borderRadius: 20,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginRight: 12
      },
  
      profileTitle: {
        fontSize: 18,
        fontWeight: "800"
      },
  
      profileSubtitle: {
        fontSize: 11,
        marginTop: 3
      },
  
      settingCard: {
        borderWidth: 1,
        borderRadius: 19,
        padding: 15,
        marginBottom: 12
      },
  
      settingRow: {
        flexDirection:
          "row",
        alignItems:
          "center"
      },
  
      settingIcon: {
        width: 42,
        height: 42,
        borderRadius: 13,
        alignItems:
          "center",
        justifyContent:
          "center",
        marginRight: 10
      },
  
      settingTitle: {
        fontSize: 14,
        fontWeight: "800"
      },
  
      settingSubtitle: {
        fontSize: 10,
        marginTop: 3
      },
  
      sensorStatus: {
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 6
      },
  
      sensorStatusText: {
        fontSize: 9,
        fontWeight: "800"
      },
  
      settingNote: {
        fontSize: 10,
        lineHeight: 16,
        marginTop: 10
      },
  
      divider: {
        height: 1,
        backgroundColor:
          "rgba(130,145,165,.18)",
        marginVertical: 14
      },
  
      intervalTitle: {
        fontSize: 11,
        fontWeight: "800",
        marginBottom: 8
      },
  
      intervalRow: {
        flexDirection:
          "row",
        justifyContent:
          "space-between"
      },
  
      intervalButton: {
        width: "23%",
        height: 40,
        borderWidth: 1,
        borderRadius: 11,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      intervalText: {
        fontSize: 11,
        fontWeight: "800"
      },
  
      aboutCard: {
        borderWidth: 1,
        borderRadius: 19,
        padding: 16
      },
  
      aboutIcon: {
        width: 44,
        height: 44,
        borderRadius: 13,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      aboutTitle: {
        fontSize: 16,
        fontWeight: "800",
        marginTop: 10
      },
  
      aboutText: {
        fontSize: 11,
        lineHeight: 17,
        marginTop: 4
      },
  
      version: {
        fontSize: 9,
        marginTop: 12
      },
  
      /* BOTTOM NAV */
  
      bottomNav: {
        height: 72,
        borderTopWidth: 1,
        flexDirection:
          "row",
        alignItems:
          "center",
        justifyContent:
          "space-around"
      },
  
      bottomItem: {
        flex: 1,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      bottomIcon: {
        width: 42,
        height: 34,
        borderRadius: 12,
        alignItems:
          "center",
        justifyContent:
          "center"
      },
  
      bottomIconCenter: {
        width: 46,
        height: 38
      },
  
      bottomLabel: {
        fontSize: 9,
        marginTop: 2,
        fontWeight: "700"
      }
  
    });