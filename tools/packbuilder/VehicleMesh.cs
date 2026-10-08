using CodeWalker.GameFiles;
using SharpDX;

namespace LoeVdPack;

// Araç modelinin (yft) tüm geometrisini araç uzayında (dinlenme pozu) toplar.
class VehicleMesh
{
    public string Model;
    public Bone[] Bones;
    public Matrix[] Abs;          // kemik mutlak dönüşümü (kemik yerel → araç)
    public Matrix[] InvAbs;
    public Vector3 BBMin, BBMax;  // temel yft'nin çizim kutusu (GetModelDimensions ile uyumlu)

    public List<Vector3> P = new();
    public List<Vector3> N = new();
    public List<int> VBone = new();
    public List<int[]> Tris = new();     // köşe indeksleri
    public List<bool> TriPaint = new();
    public List<string> TriShader = new();
    public List<Vector2> UV = new();
    public HashSet<string> Shaders = new();

    static readonly Dictionary<uint, string> ShaderNames = BuildShaderNames();

    static Dictionary<uint, string> BuildShaderNames()
    {
        var names = new List<string>();
        for (int i = 1; i <= 9; i++)
        {
            names.Add("vehicle_paint" + i);
            names.Add("vehicle_paint" + i + "_enveff");
            names.Add("vehicle_paint" + i + "_lvr");
            names.Add("vehicle_paint" + i + "_emissive");
        }
        names.AddRange(new[] { "vehicle_paint3_lvr", "vehicle_paint4_emissive", "vehicle_paint4_enveff", "vehicle_mesh", "vehicle_mesh_enveff",
            "vehicle_mesh2_enveff", "vehicle_vehglass", "vehicle_vehglass_inner", "vehicle_tire", "vehicle_tire_emissive", "vehicle_interior",
            "vehicle_interior2", "vehicle_badges", "vehicle_shuts", "vehicle_lightsemissive", "vehicle_lights", "vehicle_licenseplate",
            "vehicle_dash_emissive", "vehicle_dash_emissive_opaque", "vehicle_detail", "vehicle_detail2", "vehicle_decal", "vehicle_decal2",
            "vehicle_blurredrotor", "vehicle_blurredrotor_emissive", "vehicle_basic", "vehicle_cloth", "vehicle_cloth2", "vehicle_cutout",
            "vehicle_emissive_alpha", "vehicle_emissive_opaque", "vehicle_generic", "vehicle_mesh_emissive", "vehicle_track", "vehicle_track2" });
        var d = new Dictionary<uint, string>();
        foreach (var n in names) d[JenkHash.GenHash(n)] = n;
        return d;
    }

    public static string ShaderName(ShaderFX s)
    {
        if (s == null) return "?";
        return ShaderNames.TryGetValue(s.Name.Hash, out var n) ? n : JenkIndex.TryGetString(s.Name.Hash) is string t && t.Length > 0 ? t : "0x" + s.Name.Hash.ToString("X8");
    }

    public static YftFile LoadYft(string path)
    {
        var data = File.ReadAllBytes(path);
        var entry = RpfFile.CreateResourceFileEntry(ref data, 0);
        entry.Name = Path.GetFileName(path);
        entry.NameLower = entry.Name.ToLowerInvariant();
        data = ResourceBuilder.Decompress(data);
        var yft = new YftFile(entry);
        yft.Load(data, entry);
        return yft;
    }

    static Vector3 ReadV3(VertexData vd, int v, int c)
    {
        var info = vd.Info;
        var t = info.GetComponentType(c);
        int o = v * vd.VertexStride + info.GetComponentOffset(c);
        var b = vd.VertexBytes;
        switch (t)
        {
            case VertexComponentType.Float3:
            case VertexComponentType.Float4:
                return new Vector3(BitConverter.ToSingle(b, o), BitConverter.ToSingle(b, o + 4), BitConverter.ToSingle(b, o + 8));
            case VertexComponentType.Half4:
                return new Vector3((float)BitConverter.ToHalf(b, o), (float)BitConverter.ToHalf(b, o + 2), (float)BitConverter.ToHalf(b, o + 4));
            case VertexComponentType.RGBA8SNorm:
                return new Vector3((sbyte)b[o] / 127f, (sbyte)b[o + 1] / 127f, (sbyte)b[o + 2] / 127f);
            case VertexComponentType.Colour:
            case VertexComponentType.UByte4:
                return new Vector3(b[o] / 127.5f - 1f, b[o + 1] / 127.5f - 1f, b[o + 2] / 127.5f - 1f);
            default:
                return new Vector3(BitConverter.ToSingle(b, o), BitConverter.ToSingle(b, o + 4), BitConverter.ToSingle(b, o + 8));
        }
    }

    static Vector2 ReadV2(VertexData vd, int v, int c)
    {
        var info = vd.Info;
        var t = info.GetComponentType(c);
        int o = v * vd.VertexStride + info.GetComponentOffset(c);
        var b = vd.VertexBytes;
        if (t == VertexComponentType.Half2 || t == VertexComponentType.Half4)
            return new Vector2((float)BitConverter.ToHalf(b, o), (float)BitConverter.ToHalf(b, o + 2));
        return new Vector2(BitConverter.ToSingle(b, o), BitConverter.ToSingle(b, o + 4));
    }

    static byte[] Read4(VertexData vd, int v, int c)
    {
        int o = v * vd.VertexStride + vd.Info.GetComponentOffset(c);
        return new[] { vd.VertexBytes[o], vd.VertexBytes[o + 1], vd.VertexBytes[o + 2], vd.VertexBytes[o + 3] };
    }

    public static VehicleMesh Load(string yftDir, string model, bool useHi)
    {
        var basePath = Path.Combine(yftDir, model + ".yft");
        var hiPath = Path.Combine(yftDir, model + "_hi.yft");
        if (!File.Exists(basePath)) throw new FileNotFoundException(basePath);
        var baseYft = LoadYft(basePath);
        var geoYft = useHi && File.Exists(hiPath) ? LoadYft(hiPath) : baseYft;

        var m = new VehicleMesh { Model = model };
        var bd = baseYft.Fragment.Drawable;
        m.BBMin = bd.BoundingBoxMin;
        m.BBMax = bd.BoundingBoxMax;

        var d = geoYft.Fragment.Drawable;
        m.Bones = d.Skeleton?.Bones?.Items ?? Array.Empty<Bone>();
        int nb = m.Bones.Length;
        m.Abs = new Matrix[nb];
        m.InvAbs = new Matrix[nb];
        var done = new bool[nb];
        Matrix AbsOf(int i)
        {
            if (done[i]) return m.Abs[i];
            var b = m.Bones[i];
            var local = Matrix.AffineTransformation(1.0f, b.Rotation, b.Translation);
            m.Abs[i] = (b.ParentIndex >= 0 && b.ParentIndex < nb) ? local * AbsOf(b.ParentIndex) : local;
            done[i] = true;
            return m.Abs[i];
        }
        for (int i = 0; i < nb; i++) { AbsOf(i); m.InvAbs[i] = Matrix.Invert(m.Abs[i]); }

        var models = d.DrawableModels?.High ?? Array.Empty<DrawableModel>();
        foreach (var dm in models)
        {
            bool skin = dm.HasSkin == 1;
            int mbone = dm.BoneIndex;
            foreach (var g in dm.Geometries)
            {
                var vd = g.VertexData;
                if (vd?.Info == null || g.IndexBuffer?.Indices == null) continue;
                var sh = ShaderName(g.Shader);
                m.Shaders.Add(sh);
                bool paint = sh.StartsWith("vehicle_paint");
                uint flags = vd.Info.Flags;
                bool hasN = ((flags >> 3) & 1) == 1;
                bool hasBW = ((flags >> 1) & 1) == 1, hasBI = ((flags >> 2) & 1) == 1;
                int baseIdx = m.P.Count;
                for (int v = 0; v < vd.VertexCount; v++)
                {
                    var p = ReadV3(vd, v, 0);
                    var n = hasN ? ReadV3(vd, v, 3) : Vector3.UnitZ;
                    int bone = mbone;
                    if (skin && hasBW && hasBI)
                    {
                        var bw = Read4(vd, v, 1);
                        var bi = Read4(vd, v, 2);
                        int j = 0;
                        for (int k = 1; k < 4; k++) if (bw[k] > bw[j]) j = k;
                        int idx = bi[j];
                        bone = (g.BoneIds != null && idx < g.BoneIds.Length) ? g.BoneIds[idx] : idx;
                    }
                    else if (mbone < nb)
                    {
                        p = Vector3.TransformCoordinate(p, m.Abs[mbone]);
                        n = Vector3.TransformNormal(n, m.Abs[mbone]);
                    }
                    if (bone >= nb) bone = 0;
                    if (n.LengthSquared() > 1e-8f) n.Normalize(); else n = Vector3.UnitZ;
                    m.P.Add(p);
                    m.N.Add(n);
                    m.VBone.Add(bone);
                    m.UV.Add(((flags >> 6) & 1) == 1 ? ReadV2(vd, v, 6) : Vector2.Zero);
                }
                var ind = g.IndexBuffer.Indices;
                for (int i = 0; i + 2 < ind.Length; i += 3)
                {
                    int a = baseIdx + ind[i], b = baseIdx + ind[i + 1], c = baseIdx + ind[i + 2];
                    if (a == b || b == c || a == c) continue;
                    m.Tris.Add(new[] { a, b, c });
                    m.TriPaint.Add(paint);
                    m.TriShader.Add(sh);
                }
            }
        }
        return m;
    }
}
