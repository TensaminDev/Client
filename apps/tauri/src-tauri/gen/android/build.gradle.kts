import com.android.build.gradle.LibraryExtension

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.3.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.10")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

subprojects {
    afterEvaluate {
        plugins.withId("com.android.library") {
            extensions.configure<LibraryExtension>("android") {
                compileSdk = 36
            }
        }
    }
}

tasks.register("clean").configure {
    delete("build")
}
