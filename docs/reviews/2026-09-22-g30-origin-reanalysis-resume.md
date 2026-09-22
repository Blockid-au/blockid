# G30 v3.31.0 build resume

Build6732b1115 / BltwQdjEmjg0PY1bcBhZE completed at the first deploy attempt;
subsequent dependency snapshot refused a changed source/copy fingerprint.
Shared Vitest cache had concurrent changes; source dependency installation was
not performed. No candidate process launched and no traffic switched.
The unserved artifact was preserved under /data/g30-failed-unserved.

Existing --skip-build incorrectly required the10GiB compiler reserve although
no compiler runs, and the manifest retained the previous build SHA until late
gates. The deploy helper now records the successful build identity immediately
and validates prebuilt BUILD_ID, clean recorded SHA and only deployment-script
or documentation changes before using the existing14GiB launch reserve. Normal
build admission still requires24GiB. Runtime snapshot/browser/live gates remain.

For this interrupted successful build only, root repairs build_sha to the known
6732b1115156de4b0de387498705390af1b0465e from the completed build while source
HEAD was unchanged. The final deployed build identity must remain that SHA,
even though release-controller-only fixes are a later source commit.

Founder subsequently accepted stopping only inactive v3.29.2 port4102 after
v3.31.0 is operationally verified, preserving live, two compatible rollbacks
and all data/artifacts. This is an explicit scoped risk acceptance, not proof
that legacy detached jobs are empty and not permission to stop other origins.
