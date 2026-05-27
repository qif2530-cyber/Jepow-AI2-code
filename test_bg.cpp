#include <iostream>

class SocketModifiedFlags {
public:
    bool any() const { return true; }
};

class Node {
public:
    SocketModifiedFlags socket_modified;
    bool is_modified() const { return socket_modified.any(); }
};

class Shader : public Node {
};

class Background : public Node {
public:
    Shader *shader;
    bool use_shader;
    Shader *default_background;

    Shader *get_shader() {
        return use_shader ? (shader ? shader : default_background) : nullptr;
    }

    void tag_update() {
        Shader *bg_shader = get_shader();
        if (bg_shader && bg_shader->is_modified()) {
            std::cout << "Modified" << std::endl;
        }
    }
};

int main() {
    Background bg;
    bg.use_shader = true;
    bg.shader = new Shader();
    bg.tag_update();
    return 0;
}
