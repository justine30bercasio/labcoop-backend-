# Flutter-specific ProGuard/R8 rules
# Keep Flutter engine classes
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Keep Firebase classes
-keep class com.google.firebase.** { *; }

# Keep Google Play Core (needed for deferred components / split install)
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**

# Keep model classes used for JSON serialization
-keep class com.example.labcoop.model.** { *; }

# Keep dependencies used via reflection
-keep class com.google.gson.** { *; }
-keep class com.google.common.** { *; }

# Keep safe_device classes (root/jailbreak detection)
-keep class com.google.android.gms.safetynet.** { *; }

# General rules
-dontwarn com.google.errorprone.**
-dontwarn javax.annotation.**
-dontwarn org.checkerframework.**
-dontwarn com.google.common.**

# Keep enum classes
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable classes
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# Keep Serializable classes
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
