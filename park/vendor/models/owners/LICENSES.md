# 预设卡通主人 —— 素材授权记录

| 输出文件 | 源文件 | 素材包 | 作者 | 授权 | 下载页 |
|---|---|---|---|---|---|
| owner_a_girl_buns.glb | Models/GLB format/character-female-b.glb | Mini Characters 2.0 | Kenney (www.kenney.nl) | CC0 1.0 公有领域 | https://kenney.nl/assets/mini-characters |
| owner_b_boy_green.glb | Models/GLB format/character-male-f.glb | Mini Characters 2.0 | Kenney (www.kenney.nl) | CC0 1.0 公有领域 | https://kenney.nl/assets/mini-characters |
| owner_c_glasses.glb | Models/GLB format/character-male-a.glb | Mini Characters 2.0 | Kenney (www.kenney.nl) | CC0 1.0 公有领域 | https://kenney.nl/assets/mini-characters |

- 授权原文：src/kenney_mini/License.txt（"License: Creative Commons Zero, CC0 — http://creativecommons.org/publicdomain/zero/1.0/ … You can use this content for personal, educational, and commercial purposes. Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)"）。
- 下载时间：2026-11-24（UTC+8），官网免费下载（未捐款、未付费）。
- 必须署名：**不需要**（CC0）。建议在「关于/致谢」里写：`卡通人物：Kenney「Mini Characters」(www.kenney.nl)，CC0`。
- 本目录没有 CC BY 素材，因此没有强制署名项。
- 改动：只删掉了不用的动画（保留 idle、walk、sprint、sit、pick-up、emote-yes、interact-right），把外链贴图 colormap.png 内嵌进 GLB，做了 dedup/resample/prune。没有改模型和贴图内容。

# 拳师犬动画（anim/）
- boxer_anim*.glb 来自 boxer_triposr_20k.glb（开源 TripoSR 生成，MIT 代码）；原照片 Wikimedia Commons「Boxer dog posing on the grass」，CC0：https://commons.wikimedia.org/wiki/File:Boxer_dog_posing_on_the_grass.jpg
- 骨架、蒙皮、动画全部用 Blender 4.2.3 LTS（GPL，免费）脚本生成：anim/rig_boxer.py，没有用到第三方动画素材。
