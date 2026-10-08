using SharpDX;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace LoeVdPack;

// vdpack equip --yft <dir> --out <dir> --name <paket> --models police3,police,...
// Vanilla polis araçlarının tavan lightbar'ını prop olarak çıkarır; renk türevleri + ışık noktaları üretir.
static class EquipBuild
{
    static string F(float v) => v.ToString("0.#######", CultureInfo.InvariantCulture);
    static string Arg(string[] a, string k, string d = null) { int i = Array.IndexOf(a, k); return i >= 0 && i + 1 < a.Length ? a[i + 1] : d; }

    static readonly Dictionary<string, (byte r, byte g, byte b)> Colors = new()
    {
        ["black"] = (28, 28, 31), ["red"] = (215, 18, 22), ["blue"] = (18, 58, 230), ["amber"] = (255, 140, 0), ["white"] = (235, 235, 240),
    };

    static readonly (string id, string left, string right, string tr, string en)[] Variants =
    {
        ("rb", "red", "blue", "Kırmızı-mavi", "Red-blue"),
        ("bb", "blue", "blue", "Mavi-mavi", "Blue-blue"),
        ("rr", "red", "red", "Kırmızı-kırmızı", "Red-red"),
        ("aa", "amber", "amber", "Amber", "Amber-amber"),
    };

    class Mat { public List<Vector3> P = new(), N = new(); public List<int> I = new(); public Dictionary<int, int> Map = new(); }

    static void Add(Mat m, VehicleMesh mesh, int[] t, Vector3 origin)
    {
        foreach (var vi in t)
        {
            if (!m.Map.TryGetValue(vi, out int ni))
            {
                ni = m.P.Count;
                m.P.Add(mesh.P[vi] - origin);
                m.N.Add(mesh.N[vi]);
                m.Map[vi] = ni;
            }
            m.I.Add(ni);
        }
    }

    static string Shader(string tex, int bucket = 0) =>
        "   <Item>\n    <Name>spec</Name>\n    <FileName>spec.sps</FileName>\n    <RenderBucket value=\"" + bucket + "\" />\n    <Parameters>\n" +
        $"     <Item name=\"DiffuseSampler\" type=\"Texture\">\n      <Name>{tex}</Name>\n     </Item>\n" +
        "     <Item name=\"SpecSampler\" type=\"Texture\">\n      <Name>lb_spec</Name>\n     </Item>\n" +
        "     <Item name=\"HardAlphaBlend\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"useTessellation\" type=\"Vector\" x=\"0\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"wetnessMultiplier\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"specMapIntMask\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"specularIntensityMult\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"specularFalloffMult\" type=\"Vector\" x=\"120\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"specularFresnel\" type=\"Vector\" x=\"0.96\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"globalAnimUV1\" type=\"Vector\" x=\"0\" y=\"1\" z=\"0\" w=\"0\" />\n" +
        "     <Item name=\"globalAnimUV0\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n" +
        "    </Parameters>\n   </Item>\n";

    static void Geom(StringBuilder x, Mat m, int shader)
    {
        var mn = new Vector3(float.MaxValue); var mx = new Vector3(float.MinValue);
        foreach (var p in m.P) { mn = Vector3.Min(mn, p); mx = Vector3.Max(mx, p); }
        x.Append($"    <Item>\n     <ShaderIndex value=\"{shader}\" />\n");
        x.Append($"     <BoundingBoxMin x=\"{F(mn.X)}\" y=\"{F(mn.Y)}\" z=\"{F(mn.Z)}\" w=\"{F(mn.X)}\" />\n     <BoundingBoxMax x=\"{F(mx.X)}\" y=\"{F(mx.Y)}\" z=\"{F(mx.Z)}\" w=\"{F(mx.X)}\" />\n");
        x.Append("     <VertexBuffer>\n      <Flags value=\"0\" />\n      <Layout type=\"GTAV1\">\n       <Position />\n       <Normal />\n       <Colour0 />\n       <TexCoord0 />\n      </Layout>\n      <Data>\n");
        for (int i = 0; i < m.P.Count; i++)
        {
            var p = m.P[i]; var n = m.N[i];
            x.Append($"       {F(p.X)} {F(p.Y)} {F(p.Z)}   {F(n.X)} {F(n.Y)} {F(n.Z)}   255 0 0 255   0.5 0.5\n");
        }
        x.Append("      </Data>\n     </VertexBuffer>\n     <IndexBuffer>\n      <Data>\n       ");
        x.Append(string.Join(' ', m.I));
        x.Append("\n      </Data>\n     </IndexBuffer>\n    </Item>\n");
    }

    public static int Run(string[] args)
    {
        var yftDir = Arg(args, "--yft");
        var outDir = Arg(args, "--out", "out");
        var pack = Arg(args, "--name", "loe_vd_pack_equipment");
        var models = (Arg(args, "--models") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        var labels = (Arg(args, "--labels") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        var dir = Path.Combine(outDir, pack);
        var stream = Path.Combine(dir, "stream");
        var prev = Path.Combine(outDir, pack + "_preview");
        Directory.CreateDirectory(stream);
        Directory.CreateDirectory(prev);

        var archs = new List<(string name, string txd, Vector3 min, Vector3 max, float lod)>();
        var items = new List<object>();
        const string txd = "loe_vd_equipment";
        int barNo = 0;

        foreach (var model in models)
        {
            var mesh = VehicleMesh.Load(yftDir, model, true);
            var sirenIdx = new List<int>();
            for (int i = 0; i < mesh.Bones.Length; i++)
            {
                var n = mesh.Bones[i].Name ?? "";
                if (n.StartsWith("siren") && mesh.Abs[i].TranslationVector.Z > mesh.BBMax.Z - 0.16f) sirenIdx.Add(i);
            }
            var lightBones = sirenIdx.Where(i => !mesh.Bones[i].Name.StartsWith("siren_glass")).ToList();
            if (lightBones.Count < 2) { Console.WriteLine($"  ! {model}: tavan sireni yok"); continue; }
            var bp = sirenIdx.Select(i => mesh.Abs[i].TranslationVector).ToList();
            var bmin = new Vector3(bp.Min(p => p.X) - 0.12f, bp.Min(p => p.Y) - 0.16f, bp.Min(p => p.Z) - 0.09f);
            var bmax = new Vector3(bp.Max(p => p.X) + 0.12f, bp.Max(p => p.Y) + 0.16f, bp.Max(p => p.Z) + 0.14f);

            var sel = new List<(int ti, int kind)>(); // kind 0 gövde, 1 sol lens, 2 sağ lens
            for (int ti = 0; ti < mesh.Tris.Count; ti++)
            {
                var t = mesh.Tris[ti];
                var c = (mesh.P[t[0]] + mesh.P[t[1]] + mesh.P[t[2]]) / 3f;
                if (c.X < bmin.X || c.X > bmax.X || c.Y < bmin.Y || c.Y > bmax.Y || c.Z < bmin.Z || c.Z > bmax.Z) continue;
                var sh = mesh.TriShader[ti];
                var bone = mesh.Bones.Length > mesh.VBone[t[0]] ? mesh.Bones[mesh.VBone[t[0]]].Name ?? "" : "";
                bool siren = bone.StartsWith("siren");
                if (!siren && (sh.StartsWith("vehicle_paint") || sh.StartsWith("vehicle_interior") || sh.StartsWith("vehicle_vehglass") || sh == "vehicle_shuts")) continue;
                if (!siren && bone.StartsWith("door")) continue;
                sel.Add((ti, siren ? (c.X < 0 ? 1 : 2) : 0));
            }
            if (sel.Count(s => s.kind > 0) < 8) { Console.WriteLine($"  ! {model}: lens bulunamadı"); continue; }

            // orijin: çubuğun alt orta noktası (tavana bu noktadan oturur)
            var all = sel.SelectMany(s => mesh.Tris[s.ti]).Select(i => mesh.P[i]).ToList();
            var omin = new Vector3(all.Min(p => p.X), all.Min(p => p.Y), all.Min(p => p.Z));
            var omax = new Vector3(all.Max(p => p.X), all.Max(p => p.Y), all.Max(p => p.Z));
            var origin = new Vector3((omin.X + omax.X) / 2, (omin.Y + omax.Y) / 2, omin.Z);
            var mats = new[] { new Mat(), new Mat(), new Mat() };
            foreach (var (ti, kind) in sel) Add(mats[kind], mesh, mesh.Tris[ti], origin);
            var pmin = omin - origin; var pmax = omax - origin;
            barNo++;
            string label = barNo <= labels.Count ? labels[barNo - 1] : model.ToUpperInvariant();

            var lights = lightBones.Select(i =>
            {
                var p = mesh.Abs[i].TranslationVector - origin;
                return (p, left: p.X < 0);
            }).OrderBy(l => l.p.X).ToList();

            foreach (var v in Variants)
            {
                var name = $"loe_vd_lb_{PackWriter.Sanitize(model)}_{v.id}";
                var x = new StringBuilder();
                var c = (pmin + pmax) / 2f; float r = (pmax - pmin).Length() / 2f;
                x.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Drawable>\n");
                x.Append($" <Name>{name}</Name>\n <BoundingSphereCenter x=\"{F(c.X)}\" y=\"{F(c.Y)}\" z=\"{F(c.Z)}\" />\n <BoundingSphereRadius value=\"{F(r)}\" />\n");
                x.Append($" <BoundingBoxMin x=\"{F(pmin.X)}\" y=\"{F(pmin.Y)}\" z=\"{F(pmin.Z)}\" />\n <BoundingBoxMax x=\"{F(pmax.X)}\" y=\"{F(pmax.Y)}\" z=\"{F(pmax.Z)}\" />\n");
                x.Append(" <LodDistHigh value=\"200\" />\n <LodDistMed value=\"9998\" />\n <LodDistLow value=\"9998\" />\n <LodDistVlow value=\"9998\" />\n");
                x.Append(" <FlagsHigh value=\"1\" />\n <FlagsMed value=\"0\" />\n <FlagsLow value=\"0\" />\n <FlagsVlow value=\"0\" />\n");
                x.Append(" <ShaderGroup>\n  <Shaders>\n");
                x.Append(Shader("lb_black")).Append(Shader("lb_" + v.left)).Append(Shader("lb_" + v.right));
                x.Append("  </Shaders>\n </ShaderGroup>\n");
                x.Append(" <DrawableModelsHigh>\n  <Item>\n   <RenderMask value=\"255\" />\n   <Flags value=\"0\" />\n   <HasSkin value=\"0\" />\n   <BoneIndex value=\"0\" />\n   <Unknown1 value=\"0\" />\n   <Geometries>\n");
                for (int k = 0; k < 3; k++) if (mats[k].I.Count > 0) Geom(x, mats[k], k);
                x.Append("   </Geometries>\n  </Item>\n </DrawableModelsHigh>\n <Lights />\n</Drawable>\n");
                File.WriteAllBytes(Path.Combine(stream, name + ".ydr"), PackWriter.Ydr(x.ToString()));
                archs.Add((name, txd, pmin, pmax, 200f));

                var colorsArr = lights.Select(l => l.left ? v.left : v.right).ToArray();
                items.Add(new
                {
                    id = name,
                    cat = "sirens",
                    tr = $"{v.tr} tepe lambası ({label})",
                    en = $"{v.en} roof siren ({label})",
                    icon = "bar",
                    colors = colorsArr.Length > 6 ? colorsArr.Where((_, i) => i % (colorsArr.Length / 6 + 1) == 0).ToArray() : colorsArr,
                    roof = true,
                    props = new[] { new { m = name, o = new[] { 0f, 0f, 0f } } },
                    lights = lights.Select((l, i) => new { o = new[] { (float)Math.Round(l.p.X, 3), (float)Math.Round(l.p.Y, 3), (float)Math.Round(l.p.Z + 0.01f, 3) }, c = l.left ? v.left : v.right, g = l.left ? 1 : 2, k = "flash" }).ToArray(),
                });
            }
            Console.WriteLine($"  {model}: gövde={mats[0].I.Count / 3} sol={mats[1].I.Count / 3} sağ={mats[2].I.Count / 3} ışık={lights.Count} boyut={pmax - pmin}");
            File.WriteAllBytes(Path.Combine(prev, model + "_bar.png"), RenderBar(mats, Colors["black"], Colors["red"], Colors["blue"]));
        }

        if (archs.Count == 0) { Console.WriteLine("lightbar üretilemedi"); return 2; }
        var tex = new List<(string, byte, byte, byte, byte, string)>();
        foreach (var kv in Colors) tex.Add(("lb_" + kv.Key, kv.Value.b, kv.Value.g, kv.Value.r, 255, "DIFFUSE"));
        tex.Add(("lb_spec", 210, 210, 210, 255, "SPECULAR"));
        File.WriteAllBytes(Path.Combine(stream, txd + ".ytd"), PackWriter.Ytd(tex, Path.Combine(outDir, ".tmp_" + pack)));
        File.WriteAllBytes(Path.Combine(stream, pack + ".ytyp"), PackWriter.Ytyp(pack, archs));
        File.WriteAllText(Path.Combine(dir, "equipment.json"), JsonSerializer.Serialize(new { items }, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));
        var man = new StringBuilder();
        man.Append("fx_version 'cerulean'\ngame 'gta5'\nlua54 'yes'\n\n");
        man.Append($"name '{pack}'\nauthor 'Legends of Empire'\ndescription 'loe_vehicledesigner ekipman paketi: vanilla polis araçlarından çıkarılmış tepe lambaları'\nversion '1.0.0'\n\n");
        man.Append("loe_vd_pack 'yes'\nloe_vd_equipment 'equipment.json'\n\n");
        man.Append($"files {{\n    'equipment.json',\n    'stream/{pack}.ytyp',\n}}\n\ndata_file 'DLC_ITYP_REQUEST' 'stream/{pack}.ytyp'\n");
        File.WriteAllText(Path.Combine(dir, "fxmanifest.lua"), man.ToString(), new UTF8Encoding(false));
        try { Directory.Delete(Path.Combine(outDir, ".tmp_" + pack), true); } catch { }
        Console.WriteLine($"{pack}: {archs.Count} prop, {items.Count} katalog öğesi → {dir}");
        return 0;
    }

    // önizleme: üstten ve 3/4 açıdan düz renkli çizim
    static byte[] RenderBar(Mat[] mats, (byte, byte, byte) body, (byte, byte, byte) leftCol, (byte, byte, byte) rightCol)
    {
        int W = 900, H = 400;
        var img = new byte[W * H * 4];
        var zb = new float[W * H];
        Array.Fill(zb, float.MaxValue);
        for (int i = 0; i < W * H; i++) { img[i * 4] = 40; img[i * 4 + 1] = 42; img[i * 4 + 2] = 48; img[i * 4 + 3] = 255; }
        var view = Vector3.Normalize(new Vector3(0.55f, 0.75f, -0.45f));
        var right = Vector3.Normalize(Vector3.Cross(view, Vector3.UnitZ));
        var up = Vector3.Cross(right, view);
        var light = Vector3.Normalize(-view + up * 0.7f);
        float scale = 520f;
        var cols = new (byte, byte, byte)[] { body, leftCol, rightCol };
        for (int k = 0; k < 3; k++)
        {
            var m = mats[k];
            for (int i = 0; i + 2 < m.I.Count; i += 3)
            {
                var a = m.P[m.I[i]]; var b = m.P[m.I[i + 1]]; var c = m.P[m.I[i + 2]];
                var n = Vector3.Normalize(Vector3.Cross(b - a, c - a));
                float l = Math.Abs(Vector3.Dot(n, light)) * 0.7f + 0.3f;
                (float x, float y, float z) P(Vector3 p) => (W / 2f + Vector3.Dot(p, right) * scale, H / 2f + 40 - Vector3.Dot(p, up) * scale, Vector3.Dot(p, view));
                var A = P(a); var B = P(b); var C = P(c);
                float area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
                if (Math.Abs(area) < 1e-6f) continue;
                int x0 = Math.Max(0, (int)Math.Min(A.x, Math.Min(B.x, C.x))), x1 = Math.Min(W - 1, (int)Math.Max(A.x, Math.Max(B.x, C.x)) + 1);
                int y0 = Math.Max(0, (int)Math.Min(A.y, Math.Min(B.y, C.y))), y1 = Math.Min(H - 1, (int)Math.Max(A.y, Math.Max(B.y, C.y)) + 1);
                for (int y = y0; y <= y1; y++)
                    for (int xx = x0; xx <= x1; xx++)
                    {
                        float px = xx + 0.5f, py = y + 0.5f;
                        float w0 = ((B.x - px) * (C.y - py) - (B.y - py) * (C.x - px)) / area;
                        float w1 = ((C.x - px) * (A.y - py) - (C.y - py) * (A.x - px)) / area;
                        float w2 = 1 - w0 - w1;
                        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                        float z = w0 * A.z + w1 * B.z + w2 * C.z;
                        int idx = y * W + xx;
                        if (z >= zb[idx]) continue;
                        zb[idx] = z;
                        img[idx * 4] = (byte)(cols[k].Item1 * l); img[idx * 4 + 1] = (byte)(cols[k].Item2 * l); img[idx * 4 + 2] = (byte)(cols[k].Item3 * l);
                    }
            }
        }
        return PackWriter.Png(W, H, img);
    }
}
